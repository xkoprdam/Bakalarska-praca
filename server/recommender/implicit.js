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

class ImplicitRecommender {
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

        } catch (err) {
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

        // 1. Get top genres/artists from user's top tracks (long-term taste)
        const [ttGenreRows] = await pool.execute(`
            SELECT g.name AS genre
            FROM user_top_tracks utt
            JOIN track_artist ta ON utt.track_id = ta.track_id
            JOIN artist_genre ag ON ta.artist_id = ag.artist_id
            JOIN genres g ON ag.genre_id = g.genre_id
            WHERE utt.user_email = ?
        `, [userEmail]);

        const [ttArtistRows] = await pool.execute(`
            SELECT a.artist_id AS artist_id
            FROM user_top_tracks utt
            JOIN track_artist ta ON utt.track_id = ta.track_id
            JOIN artists a ON ta.artist_id = a.artist_id
            WHERE utt.user_email = ?
    `, [userEmail]);

        // 2. Get genres/artists from recent interactions (implicit taste)
        const [actionsGenreRows] = await pool.execute(`
            SELECT
                g.name AS genre,
                SUM(CASE WHEN i.interaction_type = 'add_to_library' THEN 3
                         WHEN i.interaction_type = 'listen' THEN 1
                         WHEN i.interaction_type = 'skip' THEN -2
                         WHEN i.interaction_type = 'remove_from_library' THEN -3
                         ELSE 0 END) as score
            FROM interactions i
            JOIN tracks t ON i.track_id = t.track_id
            JOIN track_artist ta ON t.track_id = ta.track_id
            JOIN artist_genre ag ON ta.artist_id = ag.artist_id
            JOIN genres g ON ag.genre_id = g.genre_id
            WHERE i.user_email = ?
              AND i.interacted_at > NOW() - INTERVAL 30 DAY
            GROUP BY g.name
            ORDER BY score DESC
        `, [userEmail]);

        const [actionsArtistRows] = await pool.execute(`
            SELECT
                a.artist_id,
                SUM(CASE WHEN i.interaction_type = 'add_to_library' THEN 3
                         WHEN i.interaction_type = 'listen' THEN 1                     
                         WHEN i.interaction_type = 'skip' THEN -2
                         WHEN i.interaction_type = 'remove_from_library' THEN -3
                         ELSE 0 END) as score
            FROM interactions i
            JOIN tracks t ON i.track_id = t.track_id
            JOIN track_artist ta ON t.track_id = ta.track_id
            JOIN artists a ON ta.artist_id = a.artist_id
            WHERE i.user_email = ?
              AND i.interacted_at > NOW() - INTERVAL 30 DAY
            GROUP BY a.artist_id
            ORDER BY score DESC
        `, [userEmail]);


        // 3. Merge results: sum/weight counts from both sources

        // Genres
        const genreScores = {};
        ttGenreRows.forEach(row => {
            genreScores[row.genre] = (genreScores[row.genre] || 0) + 1; // base score from top tracks
        });
        actionsGenreRows.forEach(row => {
            // more weight to recent interaction scores
            genreScores[row.genre] = (genreScores[row.genre] || 0) + (row.score * 2);
        });

        // Artists
        const artistScores = {};
        ttArtistRows.forEach(row => {
            artistScores[row.artist_id] = (artistScores[row.artist_id] || 0) + 1;
        });
        actionsArtistRows.forEach(row => {
            artistScores[row.artist_id] = (artistScores[row.artist_id] || 0) + (row.score * 2);
        });

        const topGenresArr = Object.entries(genreScores)
            .filter(([_, score]) => score > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        const topGenres = topGenresArr.map(([genre]) => genre);

        const topArtists = Object.entries(artistScores)
            .filter(([_, score]) => score > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([artist_id]) => artist_id);

        // genrePrefs with Q1, medianYear, and Q3 for each genre
        const genrePrefs = [];
        for (const genre of topGenres) {
            // Fetch all release_years for top tracks and recent interactions
            const [yearRows] = await pool.execute(
                `
                 SELECT t.release_year
                 FROM (
                   SELECT ut.track_id
                   FROM user_top_tracks ut
                   WHERE ut.user_email = ?
                   UNION ALL
                   SELECT i.track_id
                   FROM interactions i
                   WHERE i.user_email = ? AND i.interaction_type IN ('listen','add_to_library')
                 ) AS src
                 JOIN tracks t ON t.track_id = src.track_id
                 JOIN track_artist ta ON t.track_id = ta.track_id
                 JOIN artist_genre ag ON ta.artist_id = ag.artist_id
                 JOIN genres g ON ag.genre_id = g.genre_id
                 WHERE g.name = ?;
                `,
                [userEmail, userEmail, genre]
            );
            // Extract, filter, and sort release years
            const years = yearRows
                .map(r => r.release_year)
                .filter(y => y != null)
                .sort((a, b) => a - b);

            const n = years.length;
            let q1 = null, medianYear = null, q3 = null;
            if (n > 0) {
                // median
                medianYear = n % 2
                    ? years[(n - 1) / 2]
                    : (years[n/2 - 1] + years[n/2]) / 2;
                // first quartile
                q1 = years[Math.floor((n + 3) / 4) - 1];
                // third quartile
                q3 = years[Math.ceil((3 * (n + 1)) / 4) - 1];
            }

            genrePrefs.push({ name: genre, q1, medianYear, q3 });
            console.log(`Genre stats for "${genre}": Q1=${q1}, median=${medianYear}, Q3=${q3}`);
        }

        // Log top 10 genres with points
        console.log('Top 10 genres:');
        topGenresArr.forEach(([genre, score], idx) => {
            console.log(`${idx + 1}. ${genre}: ${score} points`);
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
            // Get genres for this track via its artists
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


    async _getRecommendationsFromFavoriteArtists(favoriteArtistIds, userCountry = 'SK') {
        const trackPool = [];
        for (const artistId of favoriteArtistIds) {
            try {
                const res = await this.spotifyApi.getArtistTopTracks(artistId, userCountry);
                const topTracks = res.body.tracks.slice(0, 5);
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

    /**
     * Fetches 10 tracks per genre, sampling by the user's year preferences (70/20/10 in/near/far window).
     */
    async _getGenrePlaylistTracks(genrePrefs, userCountry) {
        
        const shuffle = arr => arr.sort(() => 0.5 - Math.random());
        const poolTracks = [];
        const seenTrackIds = new Set();

        for (const pref of genrePrefs) {
            const genre = pref.name;
            const { q1, q3 } = pref;

            // Fetch playlists matching genre
            const [playlistRows] = await pool.execute(
                `SELECT playlist_id FROM playlists WHERE LOWER(genre)=LOWER(?) AND (country=? OR country IS NULL)`,
                [genre, userCountry]
            );
            let allPlaylists = playlistRows;
            if (allPlaylists.length === 0) {
                const words = genre.split(' ').filter(w => w.length > 2);
                for (const w of words) {
                    const [rows] = await pool.execute(
                        `SELECT playlist_id FROM playlists WHERE LOWER(genre)=LOWER(?) AND (country=? OR country IS NULL)`,
                        [w, userCountry]
                    );
                    if (rows.length) { allPlaylists = rows; break; }
                }
            }
            if (!allPlaylists.length) continue;

            const inWindow = [], nearWindow = [], farWindow = [];
            for (const { playlist_id } of allPlaylists) {
                const [tracks] = await pool.execute(
                    `SELECT t.track_id AS id, t.track_uri AS uri, t.title AS name, t.album, t.popularity, t.release_year
                     FROM tracks t JOIN playlist_tracks pt ON t.track_id=pt.track_id
                     WHERE pt.playlist_id=?`,
                    [playlist_id]
                );
                for (const row of tracks) {
                    if (seenTrackIds.has(row.id)) continue;
                    const y = row.release_year;
                    if (y != null && y >= q1 && y <= q3) inWindow.push(row);
                    else if (y != null && ((y >= q1-5 && y < q1) || (y > q3 && y <= q3+5))) nearWindow.push(row);
                    else farWindow.push(row);
                }
            }

            const total = 10;
            const inCount = Math.floor(total * 0.7);
            const nearCount = Math.floor(total * 0.2);
            const farCount = total - inCount - nearCount;

            const inSelected = shuffle(inWindow).slice(0, inCount);
            const nearSelected = shuffle(nearWindow).slice(0, nearCount);
            const farSelected = shuffle(farWindow).slice(0, farCount);
            console.log(`Genre "${genre}" picks:`, inSelected.length, nearSelected.length, farSelected.length);

            // // now iterate and print just the track names
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
                const combined = shuffle([...inWindow, ...nearWindow, ...farWindow]);
                for (const t of combined) {
                    if (selected.length >= total) break;
                    if (!selected.includes(t)) selected.push(t);
                }
            }

            // for (const t of selected) {
            //     seenTrackIds.add(t.id);
            //     poolTracks.push(t);
            // }

            // Fetch full Spotify metadata for these selected tracks
            const selectedTrackIds = selected.map(t => t.id);
            let spotifyTracks = [];
            if (selectedTrackIds.length > 0) {
                // getTracks allows up to 50 at once
                const chunkSize = 50;
                for (let i = 0; i < selectedTrackIds.length; i += chunkSize) {
                    const chunk = selectedTrackIds.slice(i, i + chunkSize);
                    const res = await this.spotifyApi.getTracks(chunk);
                    spotifyTracks.push(...res.body.tracks);
                }
            }

            for (const track of spotifyTracks) {
                if (!seenTrackIds.has(track.id)) {
                    seenTrackIds.add(track.id);
                    poolTracks.push(track);
                }
            }
        }

        // Final shuffle and trim
        return shuffle(poolTracks).slice(0, 10);
    }


    async _calculateRecommendations(userProfile, candidates) {
        const now = new Date();

        console.log('user top genres:', userProfile.genres);
        // console.log('user top artists:', userProfile.artists);
        console.log("Candidate tracks found:", candidates.length);

        const scored = candidates.map(({ track, genres }) => {
            const genreScore   = this._genreSimilarity(userProfile.genres, genres);
            const popScore     = this._normalizePopularity(track.popularity);

            const finalScore = 0.8 * genreScore + 0.2 * popScore;

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
        const result = [
            ...topScoredTracks.map(track => ({ track, source: 'scored' })),
            ...genreTracks.map( track => ({ track, source: 'genre_pool' })),
            ...uniqueArtistTracks.map(track => ({ track, source: 'favorite_artist' }))
        ].slice(0, 20);

        // Shuffle result
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }

        return result;
    }

    // _genreSimilarity(userGenres, trackGenres) {
    //     if (!trackGenres || trackGenres.length === 0) return 0;
    //     const overlap = trackGenres.filter(g => userGenres.includes(g));
    //     return overlap.length / userGenres.length;
    // }

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

    _normalizeRecency(releaseDate, now) {
        try {
            const release = new Date(releaseDate);
            const oneYear = 1000 * 60 * 60 * 24 * 365;
            const age = (now - release) / oneYear;
            return Math.max(0, 1 - age / 2); // Decay after 2 years
        } catch (e) {
            return 0.5; // fallback
        }
    }
}

module.exports = ImplicitRecommender;