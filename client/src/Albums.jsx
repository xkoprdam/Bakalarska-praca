import { useEffect, useState } from 'react';
import SpotifyWebApi from 'spotify-web-api-node';
import TrackRow from "./TrackRow.jsx";

const spotifyApi = new SpotifyWebApi({
    clientId: "84dda6ace0e94d1aa569581948fd9f7d",
});

export default function Albums({ accessToken, chooseTrack }) {
    const [albums, setAlbums] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedAlbum, setSelectedAlbum] = useState(null);
    const [albumTracks, setAlbumTracks] = useState([]);
    // const [albumImgUrls, setAlbumImgUrls] = useState([]);
    const [offset, setOffset] = useState(0);

    const limit = 20;

    useEffect(() => {
        if (!accessToken) return;

        spotifyApi.setAccessToken(accessToken);
        fetchSavedAlbums();
    }, [accessToken, offset]);

    const fetchSavedAlbums = async () => {
        try {
            setLoading(true);
            const response = await spotifyApi.getMySavedAlbums({
                limit,
                offset
            });

            setAlbums(prev => offset === 0 ? response.body.items : [...prev, ...response.body.items]);
            setError(null);
        } catch (err) {
            console.error('Error fetching albums:', err);
            setError('Failed to load albums');
        } finally {
            setLoading(false);
        }
    };

    const fetchAlbumTracks = async (album) => {
        try {
            setLoading(true);
            console.log(album.images);
            const response = await spotifyApi.getAlbumTracks(album.id);

            // Attach album.images to each track
            const tracksWithImages = response.body.items.map(track => ({
                ...track,
                album: { images: album.images }
            }));

            setAlbumTracks(tracksWithImages);
            setSelectedAlbum(album.name);

        } catch (err) {
            console.error('Error fetching album tracks:', err);
            setError('Failed to load album tracks');
        } finally {
            setLoading(false);
        }
    };

    const loadMore = () => {
        setOffset(prev => prev + limit);
    };

    if (loading && offset === 0 && !selectedAlbum) {
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
            {selectedAlbum ? (
                <>
                    <button
                        onClick={() => {
                            setSelectedAlbum(null);
                            setAlbumTracks([]);
                        }}
                        className="flex items-center gap-2 text-gray-400 hover:text-white mb-4"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                        </svg>
                        Back to albums
                    </button>

                    <div className="flex items-center gap-4 mb-6">
                        <h2 className="text-2xl font-bold text-white">{selectedAlbum}</h2>
                        <span className="text-gray-400">{albumTracks.length} tracks</span>
                    </div>

                    <div className="space-y-2">
                        {albumTracks.map((track, index) => (
                            <TrackRow track={track} chooseTrack={chooseTrack} index={index+1} />
                        ))}
                    </div>
                </>
            ) : (
                <>
                    <h2 className="text-2xl font-bold text-white">Albums</h2>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {albums.map((savedAlbum) => {
                            const album = savedAlbum.album;
                            return (
                                <div
                                    key={album.id}
                                    className="bg-green-950 rounded-lg overflow-hidden hover:bg-green-900 transition duration-200 cursor-pointer"
                                    onClick={() => fetchAlbumTracks(album)}
                                >
                                    <div className="relative pb-full">
                                        {album.images.length > 0 ? (
                                            <img
                                                src={album.images[0].url}
                                                alt={album.name}
                                                className="absolute h-full w-full object-cover"
                                            />
                                        ) : (
                                            <div className="absolute h-full w-full bg-green-900 flex items-center justify-center">
                                                <span className="text-4xl">💿</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-3">
                                        <h3 className="font-semibold text-white truncate">{album.name}</h3>
                                        <p className="text-gray-400 text-sm truncate">
                                            {album.artists.map(artist => artist.name).join(', ')}
                                        </p>
                                        <p className="text-gray-400 text-xs mt-1">
                                            {album.release_date.split('-')[0]} • {album.total_tracks} songs
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {albums.length > 0 && (
                        <button
                            onClick={loadMore}
                            disabled={loading}
                            className="w-full py-2 px-4 bg-green-950 hover:bg-green-900 rounded text-white disabled:opacity-50"
                        >
                            {loading ? 'Loading...' : 'Load More'}
                        </button>
                    )}
                </>
            )}
        </div>
    );
}