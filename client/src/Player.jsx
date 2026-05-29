import { useState, useEffect, useRef } from "react";
import SpotifyPlayer from "react-spotify-web-playback";
import axios from "axios";

export default function Player({ accessToken, trackUri, trackUris, onDeviceReady }) {
    const [play, setPlay] = useState(false);

    // Track URI and playback time refs
    const prevTrackUri = useRef(null);
    const lastTrackStart = useRef(null);

    // Play when single track or playlist changes
    useEffect(() => { if (trackUri) setPlay(true); }, [trackUri]);
    useEffect(() => { if (trackUris?.length) setPlay(true); }, [trackUris]);

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

        if (state.deviceId) {
            onDeviceReady?.(state.deviceId);
        }

    };

    const handleGetPlayer = (player) => {
        console.log('🎵 getPlayer called, player:', player);
        player.addListener('ready', ({ device_id }) => {
            console.log('✅ Device ready, ID:', device_id);
            onDeviceReady?.(device_id);
        });
        player.addListener('not_ready', ({ device_id }) => {
            console.log('❌ Device went offline:', device_id);
        });
        player.addListener('initialization_error', ({ message }) => {
            console.error('🔴 Init error:', message);
        });
        player.addListener('authentication_error', ({ message }) => {
            console.error('🔴 Auth error:', message);
        });
        player.addListener('account_error', ({ message }) => {
            console.error('🔴 Account error:', message);
        });
    };

    if (!accessToken) return null;
    return (
        <SpotifyPlayer
            token={accessToken}
            callback={handleCallback}
            getPlayer={handleGetPlayer}
            play={play}
            uris={trackUris?.length ? trackUris : trackUri ? [trackUri] : []}
            persistDeviceSelection
            syncExternalDevice
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
