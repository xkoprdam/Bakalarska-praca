import React, { useEffect, useState } from 'react';
import axios from 'axios';
import TrackRow from "./TrackRow.jsx";

export default function Recommendations({ accessToken, chooseTrack, recommendations, setRecommendations, playList }) {
    // const [recommendations, setRecommendations] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [playStatus, setPlayStatus] = useState(null);
    const [libraryStatus, setLibraryStatus] = useState({});
    const [activeTab, setActiveTab] = useState('implicit');

    const recommendationsForTab = recommendations[activeTab] || [];

    useEffect(() => {
        if (!accessToken) return;
    }, [accessToken]);


    useEffect(() => {
        if (recommendations.length > 0 && accessToken) {
            const ids = recommendations.map(r => r.track.id);
            axios.get('https://api.spotify.com/v1/me/tracks/contains', {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                params: { ids: ids.join(',') }
            }).then(res => {
                const status = {};
                ids.forEach((id, i) => { status[id] = res.data[i]; });
                setLibraryStatus(status);
            });
        }
    }, [recommendations, accessToken]);


    const fetchRecommendations = async () => {
        try {
            setLoading(true);
            setError(null);

            const response = await axios.post('http://localhost:3001/recommendations',
                { accessToken },
                {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    validateStatus: (status) => status < 500 // Don't throw for 4xx errors
                }
            );

            console.log('Recommendations API response:', response.data);

            if (response.status !== 200) {
                throw new Error(response.data.error || 'Failed to fetch recommendations');
            }

            setRecommendations(response.data);
        } catch (err) {
            console.error('Recommendations error:', err);
            setError(err.message || 'Failed to load recommendations');
            setRecommendations([]);
        } finally {
            setLoading(false);
        }
    };

    const refreshRecommendations = () => {
        fetchRecommendations();
    };

    const handlePlayAll = () => {
        const uris = recommendationsForTab.map(rec => rec.track?.uri ?? rec.uri).filter(Boolean);
        if (!uris.length) return;
        playList(uris);
        setPlayStatus('success');
    };

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

    if (loading && recommendations.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500"></div>
                <p className="text-gray-400">Finding your perfect recommendations...</p>
            </div>
        );
    }

    if (!loading && recommendations.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 space-y-4">
                <p className="text-gray-400 text-center max-w-md">
                    Click below to generate your recommendations!
                </p>
                <button
                    onClick={refreshRecommendations}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-full text-white"
                    disabled={loading}
                >
                    Get Recommendations
                </button>
            </div>
        );
    }


    if (error) {
        return (
            <div className="flex flex-col items-center p-6 space-y-4">
                <div className="text-red-500 text-center">
                    {error.includes('401') ? 'Session expired. Please log in again.' : error}
                </div>
                <button
                    onClick={refreshRecommendations}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-full text-white font-medium"
                    disabled={loading}
                >
                    {loading ? (
                        <span className="flex items-center">
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Retrying...
                        </span>
                    ) : 'Try Again'}
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-4 pb-20">
            {/* Tab selectors */}
            <div className="flex w-full mb-4">
                <button
                    className={`flex-1 text-center p-2 m-1 hover:bg-green-900 rounded-full ${
                        activeTab === 'implicit' ? 'bg-green-900 text-white' : 'bg-green-950 text-gray-300'
                    }`}
                    onClick={() => setActiveTab('implicit')}
                >
                    Playlist 1
                </button>
                <button
                    className={`flex-1 text-center p-2 m-1 rounded-full hover:bg-green-900 ${
                        activeTab === 'hybrid' ? 'bg-green-900 text-white' : 'bg-green-950 text-gray-300'
                    }`}
                    onClick={() => setActiveTab('hybrid')}
                >
                    Playlist 2
                </button>
                <button
                    className={`flex-1 text-center p-2 m-1 rounded-full hover:bg-green-900 ${
                        activeTab === 'explicit' ? 'bg-green-900 text-white' : 'bg-green-950 text-gray-300'
                    }`}
                    onClick={() => setActiveTab('explicit')}
                >
                    Playlist 3
                </button>
            </div>

            <div className="flex items-center w-full mb-4">
                {/* Left: Play All */}
                <div className="flex-1">
                    <button
                        onClick={handlePlayAll}
                        className="flex items-center space-x-1 px-4 py-2 ml-2 bg-green-600 hover:bg-green-700 rounded-full text-white font-medium text-sm disabled:opacity-50"
                        disabled={loading}
                    >
                        <span>▶ Play All</span>
                    </button>
                    {playStatus === 'success' && <span className="text-green-400 ml-2">Playing!</span>}
                    {playStatus === 'error' && <span className="text-red-400 ml-2">Could not start playback.</span>}
                    {playStatus === 'loading' && <span className="text-gray-400 ml-2">Starting...</span>}
                </div>

                {/* Center: Title */}
                <div className="flex-1 flex justify-center">
                    <h2 className="text-2xl font-bold text-white text-center">Your Custom Mix</h2>
                </div>

                {/* Right: Refresh */}
                <div className="flex-1 flex justify-end">
                    <button
                        onClick={refreshRecommendations}
                        disabled={loading}
                        className="flex items-center space-x-1 px-4 py-2 mr-2 bg-green-600 hover:bg-green-700 rounded-full text-white font-medium text-sm disabled:opacity-50"
                    >
                        {loading ? (
                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        )}
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {recommendations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-gray-400 text-center max-w-md">
                        We couldn't find any recommendations. Try refreshing or listening to more songs to improve your recommendations.
                    </p>
                    <button
                        onClick={refreshRecommendations}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-full text-white"
                    >
                        Refresh Recommendations
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {recommendationsForTab.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 space-y-4">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-gray-400 text-center max-w-md">
                                We couldn't find any recommendations for this tab. Try refreshing or listening to more songs.
                            </p>
                            <button
                                onClick={refreshRecommendations}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-full text-white"
                            >
                                Refresh Recommendations
                            </button>
                        </div>
                    ) : (
                        recommendationsForTab.map((recommendation, index) => {
                            const track = recommendation.track;
                            const artists = track.artists.map(a => a.name).join(', ');
                            const duration = `${Math.floor(track.duration_ms / 60000)}:${String(Math.floor((track.duration_ms % 60000) / 1000)).padStart(2, '0')}`;
                            return (
                                <div
                                    key={track.id}
                                    className="flex items-center gap-4 p-2 hover:bg-green-950 rounded cursor-pointer group"
                                    onClick={() => chooseTrack(track)}
                                >
                                    <span className="text-gray-400 w-4 text-right">{index + 1}</span>
                                    <img
                                        src={track.album?.images?.[0]?.url}
                                        alt={track.name}
                                        className="w-10 h-10 rounded"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-white truncate">{track.name}</div>
                                        <div className="text-sm text-gray-400 truncate">{artists}</div>
                                    </div>
                                    <div className="text-sm text-gray-400">
                                        {duration}
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
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}