import React, { useEffect, useState } from "react";
import useAuth from "./useAuth";
import Player from "./Player.jsx";
import TrackSearchResult from "./TrackSearchResults.jsx";
import Recommendations from "./Recommendations.jsx";
import LikedSongs from "./LikedSongs.jsx";
import Playlists from "./Playlists.jsx";
import Artists from "./Artists.jsx";
import Albums from "./Albums.jsx";
import LoadingOverlay from "./LoadingOverlay.jsx";

import SpotifyWebApi from "spotify-web-api-node";

const spotifyApi = new SpotifyWebApi({
    clientId: "53f3d866cb264e309ddf3010d6c43398",
});

export default function Dashboard({ code }) {
    // const accessToken = useAuth(code);
    const { accessToken, logout } = useAuth(code); // Destructure logout from useAuth
    const [search, setSearch] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [playingTrack, setPlayingTrack] = useState();
    const [user, setUser] = useState(null); 
    const [activeView, setActiveView] = useState('search');
    const [hoverRating, setHoverRating] = useState(0);
    const [recommendations, setRecommendations] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [allRecommendations, setAllRecommendations] = useState({
        implicit: [],
        hybrid: [],
        explicit: []
    });

    function chooseTrack(track) {
        setPlayingTrack(track);
    }

    function handleRating(rating) {
        console.log(user);
        console.log(playingTrack);

        if (!playingTrack || !user)
        {
            console.log('No track or no user.');
            return;
        }

        console.log('Rating clicked:', rating);

        fetch('http://localhost:3001/ratings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                track: playingTrack,
                trackId: playingTrack.id,
                rating,
                userEmail: user.email,
                accessToken
            }),
        })
            .then((res) => res.json())
            .then((data) => console.log('Rating saved', data))
            .catch((err) => console.error('Error saving rating', err));
    }


    useEffect(() => {
        if (!accessToken) return;
        spotifyApi.setAccessToken(accessToken);

        setIsLoading(true);

        // Fetch user data when access token is available
        spotifyApi.getMe().then(userData => {
            // console.log(userData);
            setUser({
                displayName: userData.body.display_name,
                email: userData.body.email,
                country: userData.body.country,
                imgUrl: userData.body.images && userData.body.images.length > 1
                    ? userData.body.images[1].url
                    : null, // or a default placeholder URL
            });
            setIsLoading(false);
        }).catch(error => {
            setIsLoading(false);
            console.error("Error fetching user data:", error);
        });
    }, [accessToken]);

    useEffect(() => {
        if (!search) return setSearchResults([]);
        if (!accessToken) return;

        let cancel = false;
        spotifyApi.searchTracks(search).then((res) => {
            if (cancel) return;
            setSearchResults(
                res.body.tracks.items.map((track) => {
                    const smallestAlbumImage = track.album.images.reduce(
                        (smallest, image) => {
                            if (image.height < smallest.height) return image;
                            return smallest;
                        },
                        track.album.images[0]
                    );

                    // console.log(track);
                    return {
                        id: track.id,
                        uri: track.uri,
                        title: track.name,
                        name: track.name,
                        artist: track.artists[0].name,
                        artists: track.artists,
                        albumUrl: smallestAlbumImage.url,
                    };
                })
            );
        });

        return () => (cancel = true);
    }, [search, accessToken]);

    return (

        <div className="flex flex-col h-screen p-6">

            {isLoading && <LoadingOverlay />}

            {/* Main layout */}
            <div className="flex flex-1 min-h-0">

                {/* Left sidebar - Search + Results */}
                <div className="w-1/5 border-r border-gray-200 flex flex-col pr-3 h-full relative">
                    <div className="mb-4">
                        {/* Display user details */}
                        {user ? (
                            <div className="flex items-center gap-3 ml-2">
                                {user.imgUrl ? (
                                    <img
                                        src={user.imgUrl}
                                        alt="profile"
                                        className="h-12 w-12 rounded-full"
                                    />
                                ) : (
                                    <div className="h-12 w-12 rounded-full bg-gray-300 flex items-center justify-center">
                                        <span className="text-gray-600">?</span>
                                    </div>
                                )}
                                <h2 className="text font-bold">{user.displayName}</h2>
                                {/*<button*/}
                                {/*    onClick={logout}*/}
                                {/*    className="ml-4 text-sm bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-1 px-3 rounded-full transition duration-200"*/}
                                {/*>*/}
                                {/*    Log Out*/}
                                {/*</button>*/}
                            </div>
                        ) : (
                            <p>Loading user data...</p>
                        )}
                    </div>


                    {/* Sidebar navigation */}
                    <div className="space-y-2">
                        <button
                            onClick={() => setActiveView('search')}
                            className={`w-full text-center p-2 rounded-xl hover:bg-green-900 ${activeView === 'search' ? 'bg-green-900' : ''}`}
                        >
                            <input
                                type="search"
                                placeholder="Search Songs"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full p-2 text-left rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:accent-green-700"
                            />
                        </button>
                        <button
                            onClick={() => setActiveView('recommended')}
                            className={`w-full text-left px-4 py-2 rounded-xl hover:bg-green-900 ${activeView === 'recommended' ? 'bg-green-900' : ''}`}
                        >
                            Recommendations
                        </button>
                        <button
                            onClick={() => setActiveView('liked')}
                            className={`w-full text-left px-4 py-2 rounded-xl hover:bg-green-900 ${activeView === 'liked' ? 'bg-green-900' : ''}`}
                        >
                            Liked Songs
                        </button>
                        <button
                            onClick={() => setActiveView('playlists')}
                            className={`w-full text-left px-4 py-2 rounded-xl hover:bg-green-900 ${activeView === 'playlists' ? 'bg-green-900' : ''}`}
                        >
                            Playlists
                        </button>
                        <button
                            onClick={() => setActiveView('artists')}
                            className={`w-full text-left px-4 py-2 rounded-xl hover:bg-green-900 ${activeView === 'artists' ? 'bg-green-900' : ''}`}
                        >
                            Artists
                        </button>
                        <button
                            onClick={() => setActiveView('albums')}
                            className={`w-full text-left px-4 py-2 rounded-xl hover:bg-green-900 ${activeView === 'albums' ? 'bg-green-900' : ''}`}
                        >
                            Albums
                        </button>
                    </div>

                    <button
                        onClick={logout}
                        className="absolute bottom-6 left-3 right-5 w-auto text-sm bg-gray-400 hover:bg-gray-300 text-gray-800 font-medium py-2 px-3 rounded-xl transition duration-200"
                    >
                        Log Out
                    </button>

                </div>

                {/* Right content area with player and scrollable content */}
                <div className="flex-1 flex flex-col relative pl-3">

                    {/* Stars */}
                    <div className="flex justify-center p-2 space-x-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <span
                                key={star}
                                onMouseEnter={() => setHoverRating(star)}
                                onMouseLeave={() => setHoverRating(0)}
                                onClick={() => handleRating(star)}
                                style={{ cursor: "pointer", fontSize: "1.5rem" }}
                            >
                          {hoverRating >= star ? '★' : '☆'}
                        </span>
                        ))}
                    </div>

                    {/* Player fixed at top of right content area */}
                    <div className="sticky top-0 z-10 bg-white">
                        <Player accessToken={accessToken} trackUri={playingTrack?.uri} />
                    </div>


                    {/* Scrollable content below player */}
                    <div className="flex-1 overflow-y-auto">
                        {activeView === 'search' && (
                            <>
                                {searchResults.map((track) => (
                                    <TrackSearchResult
                                        track={track}
                                        key={track.uri}
                                        chooseTrack={chooseTrack}
                                        accessToken={accessToken}
                                    />
                                ))}
                            </>
                        )}

                        {activeView === 'recommended' && (
                            <Recommendations
                                accessToken={accessToken}
                                chooseTrack={chooseTrack}
                                recommendations={recommendations}
                                setRecommendations={setRecommendations}
                            />
                        )}

                        {activeView === 'liked' && (
                            <LikedSongs accessToken={accessToken} chooseTrack={chooseTrack} />
                        )}

                        {activeView === 'playlists' && (
                            <Playlists accessToken={accessToken} chooseTrack={chooseTrack} />
                        )}

                        {activeView === 'artists' && (
                            <Artists accessToken={accessToken} chooseTrack={chooseTrack} />
                        )}

                        {activeView === 'albums' && (
                            <Albums accessToken={accessToken} chooseTrack={chooseTrack} />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}