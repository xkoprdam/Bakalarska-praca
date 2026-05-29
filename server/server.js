require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const SpotifyWebApi = require('spotify-web-api-node');
const initialiseUserInDatabase = require('./initialiseUserInDatabase');

const ImplicitRecommender = require('./recommender/implicit');
const ExplicitRecommender = require('./recommender/explicit');
const HybridRecommender = require('./recommender/hybrid');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const mysql = require('mysql2/promise');

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

const spotifyConfig = {
    redirectUri: process.env.SPOTIFY_REDIRECT_URI,
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET
};

// function to insert a track into the database if not there
async function ensureTrackInDatabase(spotifyApi, track) {
    const trackId = track.id;

    // Check if track exists in DB
    const [trackRows] = await pool.execute(
        'SELECT track_id FROM tracks WHERE track_id = ?',
        [trackId]
    );
    if (trackRows.length === 0) {
        console.log(track);
        console.log('album' + track.album);
        // const albumName = track.album.name;
        // const releaseYear = parseInt(track.album.release_date.split('-')[0], 10);
        const albumName = track.album?.name || '';
        const releaseYear = track.album?.release_date
            ? parseInt(track.album.release_date.split('-')[0], 10)
            : null;

        await pool.execute(
            `INSERT INTO tracks
                (track_id, track_uri, title, album, release_year)
                VALUES (?, ?, ?, ?, ?)`,
            [trackId, track.uri, track.name, albumName, releaseYear]
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


// Existing routes
app.post('/refresh', (req, res) => {
    const refreshToken = req.body.refreshToken;
    if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token is required' });
    }
    const spotifyApi = new SpotifyWebApi({
        ...spotifyConfig,
        refreshToken,
    });

    spotifyApi.refreshAccessToken()
        .then(data => {
            res.json({
                accessToken: data.body.accessToken,
                expiresIn: data.body.expiresIn,
            });
        })
        .catch((err) => {
            console.log(err)
            res.sendStatus(400);
        });
});


app.post('/login', async (req, res) => {
    const contentType = req.headers["content-type"];
    if (!contentType || !contentType.includes("application/json")) {
        console.warn("🚫 Invalid Content-Type:", contentType);
        return res.sendStatus(400);
    }

    const code = req.body.code;
    if (!code) {
        console.warn("🚫 Missing 'code' in request body");
        return res.sendStatus(400);
    }

    const spotifyApi = new SpotifyWebApi(spotifyConfig);

    spotifyApi.authorizationCodeGrant(code)
        .then(async (data) => {
            const accessToken = data.body.access_token;
            const refreshToken = data.body.refresh_token;
            const expiresIn = data.body.expires_in;
            spotifyApi.setAccessToken(accessToken);

            // Fetch user info from Spotify
            const userInfo = await spotifyApi.getMe();
            const { email, display_name, country } = userInfo.body;
            // console.log(userInfo.body);

            // Insert user if not exists
            const [existing] = await pool.execute(
                'SELECT email FROM users WHERE email = ?',
                [email]
            );

            if (existing.length === 0) {
                await initialiseUserInDatabase({
                    spotifyApi,
                    pool,
                    email,
                    display_name,
                    country,
                    ensureTrackInDatabase
                });
            }

            // Respond with tokens
            res.json({ accessToken, refreshToken, expiresIn });
        })
        .catch((err) => {
            console.error("❌ Login error:", err.body || err);
            res.sendStatus(400);
        });
});


app.post('/recommendations', async (req, res) => {

    try {
        const { accessToken } = req.body;
        if (!accessToken) {
            return res.status(401).json({ error: 'Access token is required' });
        }

        const implicitRecommender = new ImplicitRecommender(accessToken);
        const explicitRecommender = new ExplicitRecommender(accessToken);
        const hybridRecommender = new HybridRecommender(accessToken);

        // Test API connection first
        try {
            const meIR = await implicitRecommender.spotifyApi.getMe();
            const meER = await explicitRecommender.spotifyApi.getMe();
            const meHR = await hybridRecommender.spotifyApi.getMe();
            // console.log('API connection successful for user:', me.body.id);
        } catch (apiError) {
            console.error('Spotify API test failed:', {
                status: apiError.statusCode,
                message: apiError.message,
                body: apiError.body
            });
            return res.status(401).json({
                error: 'Spotify API connection failed',
                details: apiError.body
            });
        }

        const implicitRecommendations = await implicitRecommender.getRecommendations();
        console.log('implicit');
        // res.json(implicitRecommendations);

        const explicitRecommendations = await explicitRecommender.getRecommendations();
        console.log('explicit');
        // res.json(explicitRecommendations);

        const hybridRecommendations = await hybridRecommender.getRecommendations();
        console.log('hybrid');
        // res.json(hybridRecommendations);

        res.json({
            implicit: implicitRecommendations,
            explicit: explicitRecommendations,
            hybrid: hybridRecommendations,
        });

    } catch (err) {
        console.error('Full recommendation error:', {
            message: err.message,
            stack: err.stack,
            status: err.statusCode,
            body: err.body
        });

        res.status(500).json({
            error: 'Recommendation failed',
            details: err.body || err.message
        });
    }
});


// handle user ratings
app.post('/ratings', async (req, res) => {
    const { track, rating, userEmail, accessToken } = req.body;

    // Validate required fields
    if (!track || !track.id || !userEmail || rating == null || !accessToken) {
        return res.status(400).json({ error: 'Missing required fields: track.id, rating, userEmail, accessToken' });
    }
    // Validate rating range (1-5)
    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be a number between 1 and 5' });
    }

    console.log('Received rating request:');
    try {
        // Ensure user exists
        const [userRows] = await pool.execute(
            'SELECT email FROM users WHERE email = ?',
            [userEmail]
        );
        if (userRows.length === 0) {
            return res.status(400).json({ error: 'User not found' });
        }

        // Ensure track (and related metadata) are in the database
        const spotifyApi = new SpotifyWebApi({ ...spotifyConfig, accessToken });
        await ensureTrackInDatabase(spotifyApi, track);

        // Upsert the rating: try update first
        const [updateResult] = await pool.execute(
            'UPDATE ratings SET rating = ?, rated_at = NOW() WHERE track_id = ? AND user_email = ?',
            [rating, track.id, userEmail]
        );
        if (updateResult.affectedRows > 0) {
            return res.json({
                track_id:   track.id,
                user_email: userEmail,
                rating,
                rated_at:   new Date().toISOString(),
            });
        }

        // Insert new rating if none existed
        await pool.execute(
            `INSERT INTO ratings (track_id, user_email, rating, rated_at)
             VALUES (?, ?, ?, NOW())`,
            [track.id, userEmail, rating]
        );
        res.json({
            track_id:   track.id,
            user_email: userEmail,
            rating,
            rated_at:   new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error saving rating:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


app.post('/play-recommendations', async (req, res) => {
    try {
        const { accessToken, recommendations, deviceId } = req.body;
        if (!accessToken || !recommendations || !Array.isArray(recommendations)) {
            return res.status(400).json({ error: 'Missing or invalid data: accessToken and recommendations (array) required' });
        }
        const spotifyApi = new SpotifyWebApi({ ...spotifyConfig, accessToken });

        // Collect track URIs
        const uris = recommendations.map(rec => rec.track ? rec.track.uri : rec.uri);

        // Start playback with the list (this replaces queue & plays now)
        await spotifyApi.play({
            uris,
            device_id: deviceId,
        });

        res.json({ status: 'ok' });
    } catch (err) {
        console.error('Error playing recommendations:', err);
        res.status(500).json({ error: 'Could not play recommendations', details: err.message });
    }
});


const ALLOWED_INTERACTIONS = ['listen', 'skip', 'add_to_library', 'remove_from_library'];

app.post('/track-changed', async (req, res) => {

    console.log('Received changed track request:', req.body);

    try {
        const { trackUri, interaction, accessToken } = req.body;

        if (!trackUri) {
            return res.status(400).json({ error: 'Track interaction: Missing trackUri' });
        }
        if (interaction && !ALLOWED_INTERACTIONS.includes(interaction)) {
            return res.status(400).json({
                error: `Invalid interaction type. Allowed: ${ALLOWED_INTERACTIONS.join(', ')}`,
            });
        }

        // Find track_id by trackUri
        const [trackRows] = await pool.execute(
            'SELECT track_id FROM tracks WHERE track_uri = ?',
            [trackUri]
        );

        let trackId;
        const spotifyApi = new SpotifyWebApi({ ...spotifyConfig, accessToken });

        if (trackRows.length === 0) {
            // If not found, fetch track metadata from Spotify
            if (!accessToken) {
                return res.status(400).json({ error: 'Track interaction: Track not in DB, provide accessToken for lookup' });
            }
            const trackIdFromUri = trackUri.split(':').pop();
            const trackMeta = await spotifyApi.getTrack(trackIdFromUri);
            await ensureTrackInDatabase(spotifyApi, trackMeta.body);
            trackId = trackIdFromUri;
        } else {
            trackId = trackRows[0].track_id;
        }

        // Get user email
        const userInfo = await spotifyApi.getMe();
        const userEmail = userInfo.body.email;

        // Ensure user exists
        const [userRows] = await pool.execute(
            'SELECT email FROM users WHERE email = ?',
            [userEmail]
        );

        if (userRows.length === 0) {
            return res.status(400).json({ error: 'Track interaction: User not found' });
        }

        // Insert into interactions table
        await pool.execute(
            `INSERT INTO interactions (user_email, track_id, interaction_type, interacted_at)
            VALUES (?, ?, ?, NOW())`,
            [userEmail, trackId, interaction]
        );

        res.json({ status: 'ok' });
    } catch (err) {
        console.error('Track interaction: Error logging track:', err);
        res.status(500).json({ error: 'Track interaction: Could not log track', details: err.message });
    }
});


app.post('/add-to-library', async (req, res) => {
    try {
        const { accessToken, track } = req.body;
        if (!accessToken || !track || !track.id) {
            return res.status(400).json({ error: 'Missing data: accessToken and track.id required' });
        }
        const trackId = track.id;
        const spotifyApi = new SpotifyWebApi({ ...spotifyConfig, accessToken });

        // Get user info
        const userInfo = await spotifyApi.getMe();
        const userEmail = userInfo.body.email;

        // Ensure user exists
        const [userRows] = await pool.execute(
            'SELECT email FROM users WHERE email = ?',
            [userEmail]
        );
        if (userRows.length === 0) {
            return res.status(400).json({ error: 'User not found' });
        }

        // Check if track is already in the user's Spotify library
        const containsRes = await spotifyApi.containsMySavedTracks([trackId]);
        const alreadyInLibrary = containsRes.body[0];

        await ensureTrackInDatabase(spotifyApi, track);

        if (alreadyInLibrary) {
            // Remove from library and log removal
            await spotifyApi.removeFromMySavedTracks([trackId]);
            await pool.execute(
                `INSERT INTO interactions (user_email, track_id, interaction_type, interacted_at)
                VALUES (?, ?, ?, NOW())`,
                [userEmail, trackId, 'remove_from_library']
            );
            res.json({ status: 'removed' });
        } else {
            // Add to library and log addition
            await spotifyApi.addToMySavedTracks([trackId]);
            await pool.execute(
                `INSERT INTO interactions (user_email, track_id, interaction_type, interacted_at)
                VALUES (?, ?, ?, NOW())`,
                [userEmail, trackId, 'add_to_library']
            );
            res.json({ status: 'added' });
        }
    } catch (err) {
        console.error('Error toggling library status:', err);
        res.status(500).json({ error: 'Could not update library status', details: err.message });
    }
});


app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date() });
});


// 404 handler — must be after all routes
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

// Global error handler — must be the last middleware
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});


// Export app for tests; only listen if running directly (not via require)
module.exports = app;

if (require.main === module) {
    app.listen(3001, () => {
        console.log('Server running on http://localhost:3001');
    });
}