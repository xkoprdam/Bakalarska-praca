import { useEffect, useState } from 'react';
import SpotifyWebApi from 'spotify-web-api-node';
import axios from 'axios';

const spotifyApi = new SpotifyWebApi({
    clientId: "84dda6ace0e94d1aa569581948fd9f7d",
});

export default function LikedSongs({ accessToken, chooseTrack }) {
    const [tracks, setTracks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [offset, setOffset] = useState(0);
    const [libraryStatus, setLibraryStatus] = useState({});
    const limit = 20; // Number of tracks to load per request

    function handlePlay(track) {
        chooseTrack(track);
        console.log(track);
    }

    useEffect(() => {
        if (!accessToken || tracks.length === 0) return;
        let ignore = false;
        tracks.forEach(item => {
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
    }, [accessToken, tracks]);

    useEffect(() => {
        if (!accessToken) return;

        spotifyApi.setAccessToken(accessToken);
        fetchLikedSongs();
    }, [accessToken, offset]);

    const fetchLikedSongs = async () => {
        try {
            setLoading(true);
            const response = await spotifyApi.getMySavedTracks({
                limit,
                offset
            });

            // If loading more tracks, append to existing ones
            setTracks(prev => offset === 0 ? response.body.items : [...prev, ...response.body.items]);
            setError(null);
        } catch (err) {
            console.error('Error fetching liked songs:', err);
            setError('Failed to load liked songs');
        } finally {
            setLoading(false);
        }
    };

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

    const loadMore = () => {
        setOffset(prev => prev + limit);
    };

    if (loading && offset === 0) {
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
            <h2 className="text-2xl font-bold text-white">Liked Songs</h2>

            <div className="space-y-2">
                {tracks.map((item, index) => {
                    const track = item.track;
                    const artists = track.artists.map(a => a.name).join(', ');
                    const duration = `${Math.floor(track.duration_ms / 60000)}:${String(Math.floor((track.duration_ms % 60000) / 1000)).padStart(2, '0')}`;
                    return (
                        <div
                            key={track.id}
                            className="flex items-center gap-4 p-2 hover:bg-green-900 rounded cursor-pointer"
                            onClick={() => handlePlay(track)}
                        >
                            <span className="text-gray-400 w-8 text-right">{index + 1}</span>
                            <img
                                src={track.album?.images?.[0]?.url}
                                alt={track.name}
                                className="w-10 h-10 rounded"
                            />
                            <div className="flex-1">
                                <div className="font-medium text-white truncate">{track.name}</div>
                                <div className="text-sm text-gray-400 truncate">{artists}</div>
                            </div>
                            <div className="text-sm text-gray-400">{duration}</div>
                            <button
                                className={
                                    "flex items-center justify-center w-[28px] h-[28px] ml-auto rounded-full border-2 transition " +
                                    (libraryStatus[track.id]
                                        ? "bg-green-600 border-green-600 hover:bg-green-700 hover:border-green-700"
                                        : "border-green-600 bg-transparent hover:bg-green-100 hover:border-green-700")
                                }
                                onClick={e => { e.stopPropagation(); handleAddToLibrary(track); }}
                            >
                                {libraryStatus[track.id] ? (
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
                    );
                })}
            </div>

            {tracks.length > 0 && (
                <button
                    onClick={loadMore}
                    disabled={loading}
                    className="w-full py-2 px-4 bg-green-950 hover:bg-green-900 rounded text-white disabled:opacity-50"
                >
                    {loading ? 'Loading...' : 'Load More'}
                </button>
            )}
        </div>
    );
}