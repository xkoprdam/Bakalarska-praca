// HISTORICKÝ SKRIPT — netreba spúšťať pri novej inštalácii.
// Slúžil na prvotné stiahnutie playlistov zo Spotify do DB cez Web API.
// Spotify endpoint getPlaylist() bol medzitým deprecated (Feb 2026 migrácia).
// Vzorové dáta sú teraz v db/init/02-seed.sql a importujú sa automaticky
// pri prvom spustení `docker compose up`. Tento súbor je tu len ako
// dokumentácia odkiaľ pôvodné playlist ID-čka pochádzajú.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const SpotifyWebApi = require('spotify-web-api-node');
const mysql = require('mysql2/promise');

// Map of playlists: genre => array of { playlist_id, name }
const playlists = {
    'topsify top int':   ['1KNl4AYfgZtOVm9KHkhPTF'],  // Topsify - Global Top 50
    'topsify hits int':   ['5iwkYfnHAGMEFLiHFFGnP4'],  // Topsify - Hits 2025
    'topsify new int':   ['4f0IMCLd3iciiLR4V6qXcp'],  // Topsify - New This Week
    'expres top sk':    ['0fQkIJIIg5KmfFpW1UoJN8'],  // Radio Express - Top 40
    'pop int':     ['6i2Qd6OpeRBAzxfscNXeWp'],
    'pop sk':      ['1G3KSG08JpCWHtjJDa1Ygq', '5S1ez5GLybQacI9MUx1rnk'],
    'rock int':    ['4mFmAp0pt9LAKTcm7814OZ'],
    'rock sk':     ['3xDMBWZzhTfsSIkEoKgIOY'],
    'rap int':     ['02okEcUQXHe2sS5ajE9XG0'],
    'rap sk':      ['1vKMMmuMCZ9F2f38PPJz7y'],
    'indie':       ['0Sm64Lu6z1OK8yM3Oeo4Wx'],
    'metal':       ['16weNrrZuTHZtsOkWqGWWZ'],
    'edm':         ['68JqzCThg5Q9qiW5MKQPap'],
    'rnb/soul':    ['4sFQsgOjpt5MW2j2ttJUvr'],
    'folk':        ['7vlFZEU9lXqmDXNxwrv7xD'],
    'punk':        ['7srv2ejUtbOohUb1zpzzfS'],
    'blues':       ['0A1IHcqjyImN9uoHRsVtBn'],
    'jazz':        ['31eDJPJQT348rL6BEPC0a5'],
    'classical':   ['5E4CbUOCiUXw2Fh8Foq51V'],
    'reagge':      ['2Hlb71OJKq0t68pYxyc7Ce'],
    'country':     ['54BRRaUmWruFLVm9ayVFrZ'],
    'latin':       ['0x5sdZSd4GbYmAucCshEsO'],
    'funk':        ['3oQiulwgoLTFRGSQj2UlR4'],
    'house':       ['5ZcH6s11jx0VdeSsI1X24R'],
    'techno':      ['3nmvtzK6ongHIjP1zY3RTH'],
    'dnb':         ['7yiLQvSWh0X1hfFuJCW8dG'],
};

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

const spotifyApi = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
});


async function ensureTrackInDatabase(track) {
    const trackId = track.id;
    const [trackRows] = await pool.execute(
        'SELECT track_id FROM tracks WHERE track_id = ?',
        [trackId]
    );
    if (trackRows.length === 0) {
        const albumName = track.album.name;
        const releaseYear = parseInt(track.album.release_date.split('-')[0], 10);
        const popularity = track.popularity || 0;
        await pool.execute(
            `INSERT INTO tracks (track_id, track_uri, title, album, popularity, release_year)
             VALUES (?, ?, ?, ?, ?)`,
            [trackId, track.uri, track.name, albumName, popularity, releaseYear]
        );

        // Insert artists and link to track
        for (const artist of track.artists) {
            const artistId = artist.id;
            const artistName = artist.name;

            // Ensure artist exists
            const [artistRows] = await pool.execute(
                'SELECT artist_id FROM artists WHERE artist_id = ?',
                [artistId]
            );
            if (artistRows.length === 0) {
                await pool.execute(
                    'INSERT INTO artists (artist_id, name, country) VALUES (?, ?, ?)',
                    [artistId, artistName, '']
                );

                // Fetch artist genres and insert into genres and artist_genre
                const artistMeta = await spotifyApi.getArtist(artistId);
                const genres = artistMeta.body.genres;
                for (const genreName of genres) {
                    const [genreRows] = await pool.execute(
                        'SELECT genre_id FROM genres WHERE name = ?',
                        [genreName]
                    );
                    let genreId;
                    if (genreRows.length === 0) {
                        const [genreInsert] = await pool.execute(
                            'INSERT INTO genres (name) VALUES (?)',
                            [genreName]
                        );
                        genreId = genreInsert.insertId;
                    } else {
                        genreId = genreRows[0].genre_id;
                    }
                    await pool.execute(
                        'INSERT IGNORE INTO artist_genre (artist_id, genre_id) VALUES (?, ?)',
                        [artistId, genreId]
                    );
                }
            }
            
            // Link track and artist
            await pool.execute(
                'INSERT IGNORE INTO track_artist (track_id, artist_id) VALUES (?, ?)',
                [trackId, artistId]
            );
        }
    }
}


async function ensurePlaylistInDatabase(playlist_id, name, genreName) {
    await pool.execute(
        'INSERT IGNORE INTO playlists (playlist_id, name, genre) VALUES (?, ?, ?)',
        [playlist_id, name, genreName]
    );
}

async function ensurePlaylistTrackInDatabase(playlist_id, track_id) {
    await pool.execute(
        'INSERT IGNORE INTO playlist_tracks (playlist_id, track_id) VALUES (?, ?)',
        [playlist_id, track_id]
    );
}

async function processPlaylistsMap() {
    for (const [genre, arr] of Object.entries(playlists)) {
        for (const playlist_id of arr) {

            try {
                const playlistData = await spotifyApi.getPlaylist(playlist_id);
                const playlistName = playlistData.body.name;
                await ensurePlaylistInDatabase(playlist_id, playlistName, genre);

                let offset = 0, fetched = 0;
                do {
                    const tracksData = await spotifyApi.getPlaylistTracks(playlist_id, { limit: 100, offset });
                    const items = tracksData.body.items;
                    fetched = items.length;
                    for (const item of items) {
                        if (!item.track) continue;
                        await ensureTrackInDatabase(item.track);
                        await ensurePlaylistTrackInDatabase(playlist_id, item.track.id);
                    }
                    offset += fetched;
                } while (fetched === 100);

                console.log(`✅ Processed playlist: ${playlistName} (${playlist_id})`);
            } catch (err) {
                console.error(`❌ Error processing playlist ${playlist_id}:`, err.message);
            }
        }
    }
}

(async () => {
    const creds = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(creds.body.access_token);
    await processPlaylistsMap();
    console.log('All playlists processed!');
    process.exit(0);
})();