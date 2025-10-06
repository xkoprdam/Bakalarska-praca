import { useEffect, useState } from 'react';
import SpotifyWebApi from 'spotify-web-api-node';
import axios from 'axios';

const spotifyApi = new SpotifyWebApi({
    clientId: "53f3d866cb264e309ddf3010d6c43398",
});

export default function Playlists({ accessToken, chooseTrack }) {
    const [playlists, setPlaylists] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedPlaylist, setSelectedPlaylist] = useState(null);
    const [playlistTracks, setPlaylistTracks] = useState([]);
    const [libraryStatus, setLibraryStatus] = useState({});

    useEffect(() => {
        if (!accessToken) return;

        spotifyApi.setAccessToken(accessToken);

        const fetchPlaylists = async () => {
            try {
                setLoading(true);
                const response = await spotifyApi.getUserPlaylists();
                setPlaylists(response.body.items);
                setError(null);
            } catch (err) {
                console.error('Error fetching playlists:', err);
                setError('Failed to load playlists');
            } finally {
                setLoading(false);
            }
        };

        fetchPlaylists();
    }, [accessToken]);

    const fetchPlaylistTracks = async (playlistId) => {
        try {
            setLoading(true);
            const response = await spotifyApi.getPlaylistTracks(playlistId);
            setPlaylistTracks(response.body.items);
            setSelectedPlaylist(playlistId);
            console.log(playlistTracks);
        } catch (err) {
            console.error('Error fetching playlist tracks:', err);
            setError('Failed to load playlist tracks');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!accessToken || playlistTracks.length === 0) return;
        let ignore = false;
        playlistTracks.forEach(item => {
            const trackId = item.track.id;
            axios.get('https://api.spotify.com/v1/me/tracks/contains', {
                headers: { Authorization: `Bearer ${accessToken}` },
                params: { ids: trackId }
            })
            .then(res => {
                if (!ignore && Array.isArray(res.data) && typeof res.data[0] === 'boolean') {
                    setLibraryStatus(prev => ({ ...prev, [trackId]: res.data[0] }));
                }
            })
            .catch(err => console.error('Error checking library status:', err));
        });
        return () => { ignore = true; };
    }, [accessToken, playlistTracks]);

    const handleAddToLibrary = async (track) => {
        try {
            const res = await axios.post('http://localhost:3001/add-to-library', {
                accessToken,
                track
            }, { headers: { 'Content-Type': 'application/json' } });
            if (res.data.status === 'added') {
                setLibraryStatus(prev => ({ ...prev, [track.id]: true }));
            } else if (res.data.status === 'removed') {
                setLibraryStatus(prev => ({ ...prev, [track.id]: false }));
            }
        } catch (err) {
            console.error('Error toggling library status:', err);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-red-500 p-4 text-center">
                {error}
            </div>
        );
    }

    return (
        <div className="space-y-4 p-4">
            {selectedPlaylist ? (
                <>
                    <div className="sticky top-0 z-10 pb-2  relative flex items-center h-16">
                        <div className="flex items-center">
                            <button
                                onClick={() => setSelectedPlaylist(null)}
                                className="flex items-center gap-2 text-gray-400 hover:text-white mb-4"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                                </svg>
                                Back to playlists
                            </button>
                        </div>

                        <div className="absolute left-1/2 -translate-x-1/2">
                            <h2 className="text-2xl font-bold text-white">
                                {playlists.find(p => p.id === selectedPlaylist)?.name}
                            </h2>
                        </div>
                    </div>

                    <div className="space-y-2 overflow-y-auto max-h-[60vh]">
                        {playlistTracks.map((item, index) => (
                            <div key={item.track.id}
                                 className="flex items-center gap-4 p-2 hover:bg-green-900 rounded"
                                 onClick={() => chooseTrack(item.track)}
                            >
                                <span className="text-gray-400 w-8 text-right">{index + 1}</span>
                                <img
                                    src={item.track.album.images[0]?.url}
                                    alt={item.track.name}
                                    className="w-10 h-10 rounded"
                                />
                                <div className="flex-1">
                                    <div className="font-medium text-white">{item.track.name}</div>
                                    <div className="text-sm text-gray-400">
                                        {item.track.artists.map(artist => artist.name).join(', ')}
                                    </div>
                                </div>
                                <div className="text-sm text-gray-400">
                                    {Math.floor(item.track.duration_ms / 60000)}
                                    :
                                    {String(Math.floor((item.track.duration_ms % 60000) / 1000)).padStart(2, '0')}
                                </div>
                                <button
                                    className={
                                        "flex items-center justify-center w-[28px] h-[28px] ml-auto rounded-full border-2 transition " +
                                        (libraryStatus[item.track.id]
                                            ? "bg-green-600 border-green-600 hover:bg-green-700 hover:border-green-700"
                                            : "border-green-600 bg-transparent hover:bg-green-100 hover:border-green-700")
                                    }
                                    onClick={e => { e.stopPropagation(); handleAddToLibrary(item.track); }}
                                >
                                    {libraryStatus[item.track.id] ? (
                                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                            <path d="M5 10.5L9 14L15 8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
                                        </svg>
                                    ) : (
                                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                            <path d="M10 5V15M5 10H15" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <>
                    <h2 className="text-2xl font-bold text-white">Your Playlists</h2>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {playlists.map((playlist) => (
                            <div
                                key={playlist.id}
                                className="bg-green-950 rounded-lg overflow-hidden hover:bg-green-900 transition duration-200 cursor-pointer"
                                onClick={() => fetchPlaylistTracks(playlist.id)}
                            >
                                <div className="relative pb-full">
                                    {playlist.images && playlist.images.length > 0 ? (
                                        <img
                                            src={playlist.images[0].url}
                                            alt={playlist.name}
                                            className="absolute h-full w-full object-cover"
                                        />
                                    ) : (
                                        <div className="absolute h-full w-full bg-green-950 flex items-center justify-center">
                                            <span className="text-4xl">🎵</span>
                                        </div>
                                    )}
                                </div>
                                <div className="p-3">
                                    <h3 className="font-semibold text-white truncate">{playlist.name}</h3>
                                    <p className="text-gray-400 text-sm">
                                        {playlist.tracks.total} {playlist.tracks.total === 1 ? 'song' : 'songs'}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}