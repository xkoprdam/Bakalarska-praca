require('dotenv').config();

const SpotifyWebApi = require('spotify-web-api-node');
const {log} = require("@tensorflow/tfjs");
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

class ExplicitRecommender {
    constructor(accessToken) {
        this.spotifyApi = new SpotifyWebApi({
            redirectUri: process.env.SPOTIFY_REDIRECT_URI,
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
            accessToken: accessToken
        })
    }

    async getRecommendations() {
        try {
            await this.spotifyApi.getMe();

            const userProfile = await this._createUserProfile();
            const popularCandidates = await this._getPopularTracks();

            return await this._calculateRecommendations(userProfile, popularCandidates);
        }
        catch (err) {
            console.error('Full error details:', {
                message: err.message,
                statusCode: err.statusCode,
                body: err.body,
                headers: err.headers
            });
            throw err;
        }
    }


    async _createUserProfile() {
        const userInfo = await this.spotifyApi.getMe();
        const userEmail = userInfo.body.email;

        // Aggregate genres and artists from explicit sources: ratings, saved tracks, playlists, followed artists

        // 1. Highly rated tracks (weight 5* = 5, 4* = 3, 3* = 1)
        const [ratedGenreRows] = await pool.execute(`
            SELECT g.name AS genre, 
                   SUM(
                    CASE
                        WHEN r.rating = 5 THEN 5
                        WHEN r.rating = 4 THEN 3
                        WHEN r.rating = 3 THEN 1
                        ELSE 0
                        END                 
                   ) AS score
            FROM ratings r
                     JOIN tracks t ON t.track_id = r.track_id
                     JOIN track_artist ta ON t.track_id = ta.track_id
                     JOIN artist_genre ag ON ta.artist_id = ag.artist_id
                     JOIN genres g ON ag.genre_id = g.genre_id
            WHERE r.user_email = ?
            GROUP BY g.name
        `, [userEmail]);
        const [ratedArtistRows] = await pool.execute(`
            SELECT a.artist_id,
                   SUM(
                           CASE
                               WHEN r.rating = 5 THEN 5
                               WHEN r.rating = 4 THEN 3
                               WHEN r.rating = 3 THEN 1
                               ELSE 0
                               END
                   ) AS score
            FROM ratings r
                     JOIN tracks t ON t.track_id = r.track_id
                     JOIN track_artist ta ON t.track_id = ta.track_id
                     JOIN artists a ON ta.artist_id = a.artist_id
            WHERE r.user_email = ?
            GROUP BY a.artist_id
        `, [userEmail]);

        // 2. User saved tracks (weight = 3)
        const [savedTrackGenreRows] = await pool.execute(`
            SELECT g.name AS genre, COUNT(*) * 3 as score
            FROM user_saved_tracks ust
                     JOIN tracks t ON t.track_id = ust.track_id
                     JOIN track_artist ta ON t.track_id = ta.track_id
                     JOIN artist_genre ag ON ta.artist_id = ag.artist_id
                     JOIN genres g ON ag.genre_id = g.genre_id
            WHERE ust.user_email = ?
            GROUP BY g.name
        `, [userEmail]);
        const [savedTrackArtistRows] = await pool.execute(`
            SELECT a.artist_id, COUNT(*) * 3 as score
            FROM user_saved_tracks ust
                     JOIN tracks t ON t.track_id = ust.track_id
                     JOIN track_artist ta ON t.track_id = ta.track_id
                     JOIN artists a ON ta.artist_id = a.artist_id
            WHERE ust.user_email = ?
            GROUP BY a.artist_id
        `, [userEmail]);

        // 3. Playlists (weight = 1)
        const [playlistGenreRows] = await pool.execute(`
            SELECT g.name AS genre, COUNT(*) as score
            FROM user_playlists up
            JOIN playlist_tracks pt ON up.playlist_id = pt.playlist_id
            JOIN tracks t ON t.track_id = pt.track_id
            JOIN track_artist ta ON t.track_id = ta.track_id
            JOIN artist_genre ag ON ta.artist_id = ag.artist_id
            JOIN genres g ON ag.genre_id = g.genre_id
            WHERE up.user_email = ?
            GROUP BY g.name
        `, [userEmail]);
        const [playlistArtistRows] = await pool.execute(`
            SELECT a.artist_id, COUNT(*) as score
            FROM user_playlists up
            JOIN playlist_tracks pt ON up.playlist_id = pt.playlist_id
            JOIN tracks t ON t.track_id = pt.track_id
            JOIN track_artist ta ON t.track_id = ta.track_id
            JOIN artists a ON ta.artist_id = a.artist_id
            WHERE up.user_email = ?
            GROUP BY a.artist_id
        `, [userEmail]);

        // 4. Followed artists (weight = 5)
        const [followedArtistRows] = await pool.execute(`
            SELECT artist_id, 5 as score
            FROM user_artists
            WHERE user_email = ?
        `, [userEmail]);

        // Combine and sum scores
        const genreScores = {};
        for (const row of [...ratedGenreRows, ...savedTrackGenreRows, ...playlistGenreRows]) {
            const score = typeof row.score === 'string' ? parseFloat(row.score) : row.score;
            genreScores[row.genre] = (genreScores[row.genre] || 0) + score;
        }
        const artistScores = {};
        for (const row of [...ratedArtistRows, ...savedTrackArtistRows, ...playlistArtistRows, ...followedArtistRows]) {
            const score = typeof row.score === 'string' ? parseFloat(row.score) : row.score;
            artistScores[row.artist_id] = (artistScores[row.artist_id] || 0) + score;
        }

        // Top genres and artists
        const topGenresArr = Object.entries(genreScores)
            .filter(([_, score]) => score > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        const topGenres = topGenresArr.map(([genre]) => genre);

        const genrePrefs = [];
        for (const genre of topGenres) {
            // Query song counts per year for this genre across ratings, saved tracks, and playlists
            const [yearRows] = await pool.execute(`
                SELECT release_year, COUNT(*) AS count
                FROM (
                    SELECT t.track_id, t.release_year
                    FROM ratings r
                        JOIN tracks t ON t.track_id = r.track_id
                        JOIN track_artist ta ON t.track_id = ta.track_id
                        JOIN artist_genre ag ON ta.artist_id = ag.artist_id
                        JOIN genres g ON ag.genre_id = g.genre_id
                    WHERE r.user_email = ? AND r.rating >= 4 AND g.name = ?
                    UNION ALL
                    SELECT t.track_id, t.release_year
                    FROM user_saved_tracks ust
                        JOIN tracks t ON t.track_id = ust.track_id
                        JOIN track_artist ta ON t.track_id = ta.track_id
                        JOIN artist_genre ag ON ta.artist_id = ag.artist_id
                        JOIN genres g ON ag.genre_id = g.genre_id
                    WHERE ust.user_email = ? AND g.name = ?
                    UNION ALL
                    SELECT t.track_id, t.release_year
                    FROM user_playlists up
                        JOIN playlist_tracks pt ON up.playlist_id = pt.playlist_id
                        JOIN tracks t ON t.track_id = pt.track_id
                        JOIN track_artist ta ON t.track_id = ta.track_id
                        JOIN artist_genre ag ON ta.artist_id = ag.artist_id
                        JOIN genres g ON ag.genre_id = g.genre_id
                    WHERE up.user_email = ? AND g.name = ?
                ) AS combined
                WHERE release_year IS NOT NULL
                GROUP BY release_year
                ORDER BY release_year
            `, [userEmail, genre, userEmail, genre, userEmail, genre]);

            console.log(`Year preferences for genre "${genre}":`);
            yearRows.forEach(row => {
                console.log(`  Year: ${row.release_year}, Count: ${row.count}`);
            });
            // Fetch all release_year values for quartile calculation
            const [allYearRows] = await pool.execute(`
                SELECT t.release_year
                FROM ratings r
                  JOIN tracks t ON t.track_id = r.track_id
                  JOIN track_artist ta ON t.track_id = ta.track_id
                  JOIN artist_genre ag ON ta.artist_id = ag.artist_id
                  JOIN genres g ON ag.genre_id = g.genre_id
                WHERE r.user_email = ? AND r.rating >= 4 AND g.name = ?
                UNION ALL
                SELECT t.release_year
                FROM user_saved_tracks ust
                  JOIN tracks t ON t.track_id = ust.track_id
                  JOIN track_artist ta ON t.track_id = ta.track_id
                  JOIN artist_genre ag ON ta.artist_id = ag.artist_id
                  JOIN genres g ON ag.genre_id = g.genre_id
                WHERE ust.user_email = ? AND g.name = ?
                UNION ALL
                SELECT t.release_year
                FROM user_playlists up
                  JOIN playlist_tracks pt ON up.playlist_id = pt.playlist_id
                  JOIN tracks t ON t.track_id = pt.track_id
                  JOIN track_artist ta ON t.track_id = ta.track_id
                  JOIN artist_genre ag ON ta.artist_id = ag.artist_id
                  JOIN genres g ON ag.genre_id = g.genre_id
                WHERE up.user_email = ? AND g.name = ?
            `, [userEmail, genre, userEmail, genre, userEmail, genre]);
            const years = allYearRows
                .map(r => r.release_year)
                .filter(y => y != null)
                .sort((a, b) => a - b);
            const n = years.length;
            let q1, medianYear, q3;
            if (n > 0) {
                medianYear = n % 2
                    ? years[(n - 1) / 2]
                    : (years[n / 2 - 1] + years[n / 2]) / 2;
                q1 = years[Math.floor((n + 3) / 4) - 1];
                q3 = years[Math.ceil((3 * (n + 1)) / 4) - 1];
            } else {
                q1 = medianYear = q3 = null;
            }
            genrePrefs.push({ name: genre, q1, medianYear, q3 });
            console.log(`Stats for genre "${genre}": Q1=${q1}, median=${medianYear}, Q3=${q3}`);
        }

        const topArtistsArr = Object.entries(artistScores)
            .filter(([_, score]) => score > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        const topArtists = topArtistsArr.map(([artist_id]) => artist_id);

        // Log top 10 genres with points
        console.log('Top 10 genres:');
        topGenresArr.forEach(([genre, score], idx) => {
            console.log(`${idx + 1}. ${genre}: ${score} points`);
        });

        // Log top 5 artists with points
        console.log('Top 5 artists:');
        topArtistsArr.forEach(([artist_id, score], idx) => {
            console.log(`${idx + 1}. ${artist_id}: ${score} points`);
        });

        return {
            genres: genrePrefs,
            artists: topArtists
        };
    }


    async _getPopularTracks() {
        // Query DB for tracks from playlists where genre is 'top int' or 'top sk'
        const [rows] = await pool.execute(`
            SELECT
                t.track_id AS id,
                t.track_uri AS uri,
                t.title AS name,
                t.album,
                t.popularity,
                t.release_year
            FROM tracks t
            JOIN playlist_tracks pt ON t.track_id = pt.track_id
            JOIN playlists p ON pt.playlist_id = p.playlist_id
            WHERE p.genre IN ('topsify top int', 'topsify hits int', 'topsify new int', 'expres top sk')
        `);

        // For each track, get its genres
        const results = [];
        for (const row of rows) {
            // Get genres for this track (via its artists)
            const [genreRows] = await pool.execute(`
                SELECT DISTINCT g.name AS genre
                FROM track_artist ta
                JOIN artist_genre ag ON ta.artist_id = ag.artist_id
                JOIN genres g ON ag.genre_id = g.genre_id
                WHERE ta.track_id = ?
            `, [row.id]);
            const genres = genreRows.map(gr => gr.genre);

            // Compose track object
            const track = {
                id: row.id,
                uri: row.uri,
                name: row.name,
                album: row.album,
                popularity: row.popularity,
                release_year: row.release_year
            };

            results.push({ track, genres });
        }

        return results;
    }


    async _getRecommendationsFromFavoriteArtists(favoriteArtistIds, userCountry) {
        const trackPool = [];
        for (const artistId of favoriteArtistIds) {
            try {
                const res = await this.spotifyApi.getArtistTopTracks(artistId, userCountry);
                const topTracks = res.body.tracks.slice(0, 10);
                for (const track of topTracks) {
                    trackPool.push(track);
                }
            } catch (e) {
                // If an artistId is invalid or unavailable, skip it
                continue;
            }
        }

        // Pick 5 random unique tracks
        const shuffled = trackPool.sort(() => 0.5 - Math.random());
        const picked = [];
        const seen = new Set();
        for (const track of shuffled) {
            if (!seen.has(track.id) && picked.length < 5) {
                picked.push(track);
                seen.add(track.id);
            }
            if (picked.length >= 5) break;
        }
        return picked;
    }

    async _getGenrePlaylistTracks(genrePrefs, userCountry) {
        const poolTracks = [];
        const seenTrackIds = new Set();

        for (const genrePref of genrePrefs) {
            const genre = genrePref.name;
            const { q1, q3 } = genrePref;

            // Probably unnecessary
            // Find playlists for this genre
            const [playlistRows] = await pool.execute(
                `SELECT playlist_id FROM playlists WHERE LOWER(genre) = LOWER(?) AND (country = ? OR country IS NULL)`,
                [genre, userCountry]
            );

            let allPlaylists = playlistRows;
            if (allPlaylists.length === 0) {
                const words = genre.split(' ').filter(w => w.length > 2);
                for (const word of words) {
                    const [rows] = await pool.execute(
                        `SELECT playlist_id FROM playlists WHERE LOWER(genre) = LOWER(?) AND (country = ? OR country IS NULL)`,
                        [word, userCountry]
                    );
                    if (rows.length > 0) {
                        allPlaylists = rows;
                        break;
                    }
                }
            }
            if (allPlaylists.length === 0) continue;


            // Collect tracks by year category
            const inWindowTracks = [];
            const nearWindowTracks = [];
            const farWindowTracks = [];

            // Collect tracks from all playlists for this genre
            for (const playlistRow of allPlaylists) {
                const playlistId = playlistRow.playlist_id;
                const [trackRows] = await pool.execute(
                    `SELECT t.track_id AS id, t.track_uri AS uri, t.title AS name, t.album, t.popularity, t.release_year
                     FROM tracks t
                     JOIN playlist_tracks pt ON t.track_id = pt.track_id
                     WHERE pt.playlist_id = ?`,
                    [playlistId]
                );

                for (const row of trackRows) {
                    if (seenTrackIds.has(row.id)) continue;
                    const year = row.release_year;
                    if (year !== null && year >= q1 && year <= q3) {
                        inWindowTracks.push(row);
                    } else if (year !== null && ((year >= q1 - 5 && year < q1) || (year > q3 && year <= q3 + 5))) {
                        nearWindowTracks.push(row);
                    } else {
                        farWindowTracks.push(row);
                    }
                }
            }

            // Sample tracks: 70% in-window, 20% near-window, 10% far-window
            const total = 10;
            const inCount = Math.floor(total * 0.7);    // 7
            const nearCount = Math.floor(total * 0.2);  // 2
            const farCount = total - inCount - nearCount;   // 1

            const shuffle = arr => arr.sort(() => 0.5 - Math.random());

            const inSelected = shuffle(inWindowTracks).slice(0, inCount);
            const nearSelected = shuffle(nearWindowTracks).slice(0, nearCount);
            const farSelected = shuffle(farWindowTracks).slice(0, farCount);

            // inSelected.forEach(track => {
            //     console.log(`Genre "${genre}" in-window track: ${track.name}`);
            // });
            // nearSelected.forEach(track => {
            //     console.log(`Genre "${genre}" near-window track: ${track.name}`);
            // });
            // farSelected.forEach(track => {
            //     console.log(`Genre "${genre}" far-window track: ${track.name}`);
            // });

            let selected = [...inSelected, ...nearSelected, ...farSelected];
            if (selected.length < total) {
                const combined = shuffle([...inWindowTracks, ...nearWindowTracks, ...farWindowTracks]);
                for (const row of combined) {
                    if (selected.length >= total) break;
                    if (!selected.includes(row)) selected.push(row);
                }
            }

            const selectedTrackIds = selected.map(row => row.id);
            let spotifyTracks = [];
            if (selectedTrackIds.length > 0) {
                const chunkSize = 50;
                for (let i = 0; i < selectedTrackIds.length; i += chunkSize) {
                    const chunk = selectedTrackIds.slice(i, i + chunkSize);
                    const res = await this.spotifyApi.getTracks(chunk);
                    spotifyTracks.push(...res.body.tracks);
                }
            }

            for (const track of spotifyTracks) {
                seenTrackIds.add(track.id);
                poolTracks.push(track);
            }
        }

        const shuffled = poolTracks.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, 10);
    }


    async _calculateRecommendations(userProfile, candidates) {
        const now = new Date();

        console.log('user top genres:', userProfile.genres);
        // console.log('user top artists:', userProfile.artists);
        console.log("Candidate tracks found:", candidates.length);

        const scored = candidates.map(({ track, genres }) => {
            const genreScore   = this._genreSimilarity(userProfile.genres, genres);
            const popScore     = this._normalizePopularity(track.popularity);

            const finalScore = 0.9 * genreScore + 0.1 * popScore;

            // console.log(`"${track.name}" score: genre=${genreScore.toFixed(2)}, genres: ${genres.join(', ')}`);

            return {
                track,
                genres,
                score: finalScore,
                genreScore,
                popScore,
            };
        });

        // Pick top 5 unique popular tracks by score
        const topScoredTracks = [];
        const seenIds = new Set();
        const pickedItems = [];

        for (const item of scored.sort((a, b) => b.score - a.score)) {
            if (!seenIds.has(item.track.id) && pickedItems.length < 5) {
                pickedItems.push(item);
                seenIds.add(item.track.id);
            }
            if (pickedItems.length >= 5) break;
        }

        // Fetch full Spotify metadata for the picked tracks (at most 5)
        let spotifyTracks = [];
        if (pickedItems.length > 0) {
            const trackIds = pickedItems.map(item => item.track.id);
            const res = await this.spotifyApi.getTracks(trackIds);
            spotifyTracks = res.body.tracks;
        }
        const idToSpotifyTrack = {};
        for (const sptTrack of spotifyTracks) {
            if (sptTrack && sptTrack.id) {
                idToSpotifyTrack[sptTrack.id] = sptTrack;
            }
        }

        for (const item of pickedItems) {
            const spotifyTrack = idToSpotifyTrack[item.track.id] || item.track;
            topScoredTracks.push(spotifyTrack);
            console.log(`Picked track: "${spotifyTrack.name}" with score ${item.score.toFixed(2)}`);
        }
        
        // const topScoredTracks = [];
        // const seenIds = new Set();
        // for (const item of scored.sort((a, b) => b.score - a.score)) {
        //     if (!seenIds.has(item.track.id) && topScoredTracks.length < 5) {
        //         topScoredTracks.push(item.track);
        //         console.log(`Picked track: "${item.track.name}" with score ${item.score.toFixed(2)}`);
        //         seenIds.add(item.track.id);
        //     }
        //     if (topScoredTracks.length >= 5) break;
        // }

        // Pick 10 tracks from genre playlists
        const userCountry = (await this.spotifyApi.getMe()).body.country;
        const genreTracks = await this._getGenrePlaylistTracks(userProfile.genres, userCountry);

        // Pick 5 from favorite artists (async)
        const favoriteArtistTracks = await this._getRecommendationsFromFavoriteArtists(userProfile.artists, userCountry);

        // Avoid duplicates with topScoredTracks
        const uniqueArtistTracks = favoriteArtistTracks.filter(
            tr => !seenIds.has(tr.id)
        ).slice(0, 5);

        // Wrap tracks with unified output format
        let result = [
            ...topScoredTracks.map(track => ({ track, source: 'scored' })),
            ...genreTracks.map( track => ({ track, source: 'genre_pool' })),
            ...uniqueArtistTracks.map(track => ({ track, source: 'favorite_artist' }))
        ].slice(0, 20);

        // Shuffle result (Fisher–Yates)
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }

        // return topScoredTracks.map(track => ({ track, source: 'scored' }))
        // return genreTracks.map( track => ({ track, source: 'genre_pool' }))
        // return uniqueArtistTracks.map(track => ({ track, source: 'favorite_artist' }))
        return result;
    }

    _genreSimilarity(userGenres, trackGenres) {
        if (!trackGenres?.length) return 0;
        const u = userGenres.map(g => g.name.toLowerCase());
        const t = trackGenres.map(g => g.toLowerCase());
        const overlap = new Set();

        for (const tg of t) {
            for (const ug of u) {
                if (tg === ug || tg.includes(ug) || ug.includes(tg)) {
                    overlap.add(ug);
                }
            }
        }
        return overlap.size / u.length;
    }


    _normalizePopularity(popularity) {
        return popularity / 100; // Spotify popularity is 0–100
    }

    // _normalizeRecency(releaseDate, now) {
    //     try {
    //         const release = new Date(releaseDate);
    //         const oneYear = 1000 * 60 * 60 * 24 * 365;
    //         const age = (now - release) / oneYear;
    //         return Math.max(0, 1 - age / 2); // Decay after 2 years
    //     } catch (e) {
    //         return 0.5; // fallback
    //     }
    // }
}

module.exports = ExplicitRecommender;