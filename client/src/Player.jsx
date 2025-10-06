import { useState, useEffect, useRef } from "react";
import SpotifyPlayer from "react-spotify-web-playback";
import axios from "axios";

export default function Player({ accessToken, trackUri }) {
    const [play, setPlay] = useState(false);

    // Track URI and playback time refs
    const prevTrackUri = useRef(null);
    const lastTrackStart = useRef(null);

    useEffect(() => setPlay(true), [trackUri]);

    const handleCallback = (state) => {
        if (!state || !state.track) return;

        const newUri = state.track.uri;
        const now = Date.now();

        // If track has changed (skip/next/prev/autoplay), check listen time for previous
        if (prevTrackUri.current && prevTrackUri.current !== newUri) {
            const playedMs = (now - lastTrackStart.current) / 1000;
            if (playedMs < 20) {

                // Send info to server: track was skipped before 20 seconds
                axios.post("http://localhost:3001/track-changed", {
                    trackUri: prevTrackUri.current,
                    interaction: "skip",
                    accessToken
                }).catch(err => {
                    console.log("Error reporting skipped track:", err);
                });
            }
            else if (playedMs > 30) {

                // Send info to server: track was listened to
                axios.post("http://localhost:3001/track-changed", {
                    trackUri: prevTrackUri.current,
                    interaction: "listen",
                    accessToken
                }).catch(err => {
                    console.log("Error reporting skipped track:", err);
                });
            }
            // Start timer for new track
            lastTrackStart.current = now;
        }
        
        // On very first play
        if (!prevTrackUri.current || prevTrackUri.current !== newUri) {
            lastTrackStart.current = now;
            prevTrackUri.current = newUri;
        }

        if (!state.isPlaying) setPlay(false);
    };

    if (!accessToken) return null;
    return (
        <SpotifyPlayer
            token={accessToken}
            callback={handleCallback}
            play={play}
            uris={trackUri ? [trackUri] : []}
            styles={{
                activeColor: '#1db954',
                bgColor: '#242424',
                color: '#fff',
                loaderColor: '#1db954',
                sliderColor: '#1db954',
                trackArtistColor: '#ccc',
                trackNameColor: '#fff',
                height: 60,
                sliderHandleColor: '#fff'
            }}
        />
    );
}
