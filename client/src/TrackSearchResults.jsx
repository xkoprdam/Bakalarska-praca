import React, {useState, useEffect} from "react"
import axios from "axios";

export default function TrackSearchResult({ track, chooseTrack, accessToken }) {
    const [libraryStatus, setLibraryStatus] = useState({});

    useEffect(() => {
        if (!accessToken || !track?.id) return;
        let ignore = false;
        axios.get('https://api.spotify.com/v1/me/tracks/contains', {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            params: { ids: track.id }
        }).then(res => {
            if (!ignore && Array.isArray(res.data) && typeof res.data[0] === "boolean") {
                setLibraryStatus(prev => ({ ...prev, [track.id]: res.data[0] }));
            }
        });
        return () => { ignore = true };
    }, [accessToken, track?.id]);


    function handlePlay() {
        chooseTrack(track);
    }

    const handleAddToLibrary = async (track) => {
        try {
            const res = await axios.post('http://localhost:3001/add-to-library', {
                accessToken,
                track
            }, {
                headers: { 'Content-Type': 'application/json' }
            });
            if (res.data.status === 'added') {
                setLibraryStatus(prev => ({ ...prev, [track.id]: true }));
            } else if (res.data.status === 'removed') {
                setLibraryStatus(prev => ({ ...prev, [track.id]: false }));
            }
        } catch {
            console.log('Error toggling track ' + track.name + ' in library');
            // alert('Could not update library.');
        }
    };

    // console.log(track);

    return (
        <div
            className="flex items-center m-2 p-2 hover:bg-gray-800 rounded cursor-pointer transition-colors duration-200"
            onClick={handlePlay}
        >
            <img
                src={track.albumUrl}
                alt="album art"
                className="h-16 w-16 rounded"
            />
            <div className="ml-3">
                <div className="text-white text-left font-medium truncate max-w-xs">
                    {track.title}
                </div>
                <div className="text-gray-400 text-left text-sm truncate max-w-xs">
                    {track.artist}
                </div>
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
                    // Transparent tick (checkmark)
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path
                            d="M5 10.5L9 14L15 8"
                            stroke="white"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity="0.8"
                        />
                    </svg>
                ) : (
                    // Green + icon
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path
                            d="M10 5V15M5 10H15"
                            stroke="#22C55E"
                            strokeWidth="2"
                            strokeLinecap="round"
                        />
                    </svg>
                )}
            </button>
        </div>
    );
}