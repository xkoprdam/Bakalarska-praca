
module.exports = async function initialiseUserInDatabase({ spotifyApi, pool, email, display_name, country, ensureTrackInDatabase }) {
    
    // 1. Insert user
    await pool.execute(
        'INSERT INTO users (email, name, country) VALUES (?, ?, ?)',
        [email, display_name, country]
    );
    console.log('user inserted');

    // 2. Top tracks (one request allows max 50 tracks)
    const top50Tracks = await spotifyApi.getMyTopTracks({ limit: 50 });
    for (const item of top50Tracks.body.items) {
        await ensureTrackInDatabase(spotifyApi, item);
        await pool.execute(
            'INSERT IGNORE INTO user_top_tracks (user_email, track_id) VALUES (?, ?)',
            [email, item.id]
        );
    }
    console.log('top 50 tracks inserted');

    const top100Tracks = await spotifyApi.getMyTopTracks({ offset: 50, limit: 50 });
    for (const item of top100Tracks.body.items) {
        await ensureTrackInDatabase(spotifyApi, item);
        await pool.execute(
            'INSERT IGNORE INTO user_top_tracks (user_email, track_id) VALUES (?, ?)',
            [email, item.id]
        );
    }
    console.log('top 51-100 tracks inserted');


    // 3. Followed artists
    const followedArtists = await spotifyApi.getFollowedArtists({ limit: 50 });
    for (const artist of followedArtists.body.artists.items) {
        const [artistRows] = await pool.execute(
            'SELECT artist_id FROM artists WHERE artist_id = ?',
            [artist.id]
        );
        if (artistRows.length === 0) {
            await pool.execute(
                'INSERT INTO artists (artist_id, name, country) VALUES (?, ?, ?)',
                [artist.id, artist.name, '']
            );
        }
        await pool.execute(
            'INSERT IGNORE INTO user_artists (user_email, artist_id) VALUES (?, ?)',
            [email, artist.id]
        );
    }
    console.log('artists inserted');

    // 4. Saved albums & tracks
    const savedAlbums = await spotifyApi.getMySavedAlbums({ limit: 20 });
    for (const item of savedAlbums.body.items) {
        const album = item.album;

        // console.log(`Processing album: ${album.name} by ${album.artists.map(a => a.name).join(', ')}`);

        const albumTracks = await spotifyApi.getAlbumTracks(album.id, { offset: 2, limit: 5 });
        for (const track of albumTracks.body.items) {
            // console.log(`Processing track: ${track.name} from album: ${album.name}`);

            track.album = album;

            await ensureTrackInDatabase(spotifyApi, track);
            await pool.execute(
                'INSERT IGNORE INTO user_saved_tracks (user_email, track_id) VALUES (?, ?)',
                [email, track.id]
            );
        }
    }
    console.log('saved albums and tracks inserted');

    // 5. Last 50 saved tracks
    const savedTracks = await spotifyApi.getMySavedTracks({ limit: 50 });
    for (const item of savedTracks.body.items) {
        const track = item.track;
        await ensureTrackInDatabase(spotifyApi, track);
        await pool.execute(
            'INSERT IGNORE INTO user_saved_tracks (user_email, track_id) VALUES (?, ?)',
            [email, track.id]
        );
    }
    console.log('saved tracks inserted');

    // 6. User's playlists and up to 50 tracks per playlist
    const playlists = await spotifyApi.getUserPlaylists({ limit: 20 });
    for (const playlist of playlists.body.items) {
        const [plRows] = await pool.execute(
            'SELECT playlist_id FROM playlists WHERE playlist_id = ?',
            [playlist.id]
        );
        if (plRows.length === 0) {
            await pool.execute(
                'INSERT INTO playlists (playlist_id, name, genre) VALUES (?, ?, ?)',
                [playlist.id, playlist.name, playlist.name.split(' ')[0].toLowerCase() || 'unknown']
            );
        }
        await pool.execute(
            'INSERT IGNORE INTO user_playlists (user_email, playlist_id) VALUES (?, ?)',
            [email, playlist.id]
        );

        const playlistTracks = await spotifyApi.getPlaylistTracks(playlist.id, { offset:0, limit: 10 });
        for (const item of playlistTracks.body.items) {
            const track = item.track;
            if (!track || !track.id) continue;
            await ensureTrackInDatabase(spotifyApi, track);
            await pool.execute(
                'INSERT IGNORE INTO playlist_tracks (playlist_id, track_id) VALUES (?, ?)',
                [playlist.id, track.id]
            );
        }
    }
    console.log('playlists and tracks inserted');
};