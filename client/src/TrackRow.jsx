import React from "react"

export default function TrackRow({ track, chooseTrack, index }) {
    function handlePlay() {
        chooseTrack(track);
        console.log(track);
    }

    return (
        <div
            className="flex items-center gap-4 p-2 hover:bg-gray-700 rounded cursor-pointer"
            onClick={handlePlay}
        >
            <span className="text-gray-400 w-8 text-right">{index}</span>
        
            <div className="flex-1 min-w-0">
                <div className="font-medium text-white truncate">
                    {track.name}
                </div>
            </div>
            <div className="text-sm text-gray-400">
                {Math.floor(track.duration_ms / 60000)}
                :
                {String(Math.floor((track.duration_ms % 60000) / 1000)).padStart(2, '0')}
            </div>
        </div>
    );
}