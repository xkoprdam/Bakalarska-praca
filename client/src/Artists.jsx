import { useEffect, useState } from 'react';
import SpotifyWebApi from 'spotify-web-api-node';
import axios from 'axios';

const spotifyApi = new SpotifyWebApi({
    clientId: "84dda6ace0e94d1aa569581948fd9f7d",
});

export default function Artists({ accessToken, chooseTrack }) {
    const [artists, setArtists] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [totalArtists, setTotalArtists] = useState(0);
    const [selectedArtist, setSelectedArtist] = useState(null);
    const [artistTopTracks, setArtistTopTracks] = useState([]);
    const [libraryStatus, setLibraryStatus] = useState({});

    useEffect(() => {
        if (!accessToken) return;

        spotifyApi.setAccessToken(accessToken);
        fetchFollowedArtists();
    }, [accessToken]);

    useEffect(() => {
        if (!accessToken || artistTopTracks.length === 0) return;
        let ignore = false;
        artistTopTracks.forEach(track => {
            axios.get('https://api.spotify.com/v1/me/tracks/contains', {
                headers: { Authorization: `Bearer ${accessToken}` },
                params: { ids: track.id }
            }).then(res => {
                if (!ignore && Array.isArray(res.data) && typeof res.data[0] === 'boolean') {
                    setLibraryStatus(prev => ({ ...prev, [track.id]: res.data[0] }));
                }
            }).catch(err => console.error('Error checking library status:', err));
        });
        return () => { ignore = true; };
    }, [accessToken, artistTopTracks]);

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

    const fetchFollowedArtists = async () => {
        try {
            setLoading(true);
            const response = await spotifyApi.getFollowedArtists({ limit: 50 });
            setArtists(response.body.artists.items);
            setTotalArtists(response.body.artists.total);
            setError(null);
        } catch (err) {
            console.error('Error fetching artists:', err);
            setError('Failed to load artists');
        } finally {
            setLoading(false);
        }
    };

    const fetchArtistTopTracks = async (artistId, artistName) => {
        try {
            setLoading(true);
            const response = await spotifyApi.getArtistTopTracks(artistId, 'US');
            setArtistTopTracks(response.body.tracks);
            setSelectedArtist(artistName);
        } catch (err) {
            console.error('Error fetching artist top tracks:', err);
            setError('Failed to load artist tracks');
        } finally {
            setLoading(false);
        }
    };

    if (loading && !selectedArtist) {
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
            {selectedArtist ? (
                <>
                    <button
                        onClick={() => {
                            setSelectedArtist(null);
                            setArtistTopTracks([]);
                        }}
                        className="flex items-center gap-2 text-gray-400 hover:text-white mb-4"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                        </svg>
                        Back to artists
                    </button>

                    <div className="flex items-center gap-4 mb-6">
                        <h2 className="text-2xl font-bold text-white">{selectedArtist}</h2>
                        <span className="text-gray-400">Top Tracks</span>
                    </div>

                    <div className="space-y-2">
                        {artistTopTracks.map((track, index) => (
                            <div key={track.id}
                                 className="flex items-center gap-4 p-2 hover:bg-green-900 rounded cursor-pointer"
                                 onClick={() => chooseTrack(track)}
                            >
                                <span className="text-gray-400 w-8 text-right">{index + 1}</span>
                                <img
                                    src={track.album.images[0]?.url}
                                    alt={track.name}
                                    className="w-10 h-10 rounded"
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-white truncate">{track.name}</div>
                                    <div className="text-sm text-gray-400 truncate">
                                        {track.album.name}
                                    </div>
                                </div>
                                <div className="text-sm text-gray-400">
                                    {Math.floor(track.duration_ms / 60000)}
                                    :
                                    {String(Math.floor((track.duration_ms % 60000) / 1000)).padStart(2, '0')}
                                </div>
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
                        ))}
                    </div>
                </>
            ) : (
                <>
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-bold text-white">Artists</h2>
                        <span className="text-gray-400">{totalArtists} artists</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {artists.map((artist) => (
                            <div
                                key={artist.id}
                                className="flex flex-col items-center gap-2 p-3 hover:bg-green-900 rounded cursor-pointer transition"
                                onClick={() => fetchArtistTopTracks(artist.id, artist.name)}
                            >
                                <div className="relative w-full aspect-square rounded-full overflow-hidden">
                                    {artist.images.length > 0 ? (
                                        <img
                                            src={artist.images[0].url}
                                            alt={artist.name}
                                            className="absolute h-full w-full object-cover"
                                        />
                                    ) : (
                                        <div className="absolute h-full w-full bg-green-900 flex items-center justify-center">
                                            <span className="text-4xl">🎤</span>
                                        </div>
                                    )}
                                </div>
                                <h3 className="font-medium text-white text-center truncate w-full">
                                    {artist.name}
                                </h3>
                                <p className="text-xs text-gray-400">
                                    {artist.genres[0] || 'Artist'}
                                </p>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}