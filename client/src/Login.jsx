import React from 'react'

const AUTH_URL =
    "https://accounts.spotify.com/authorize?client_id=84dda6ace0e94d1aa569581948fd9f7d" +
    "&response_type=code" +
    "&redirect_uri=http://127.0.0.1:3000" +
    "&scope=" +

    "ugc-image-upload%20" +         // custom playlist cover

    "user-read-playback-state%20" +
    "user-modify-playback-state%20" +
    "user-read-currently-playing%20" +

    // "app-remote-control%20" +    // iOS and Android SDK
    "streaming%20" +

    "playlist-read-private%20" +
    "playlist-read-collaborative%20" +
    "playlist-modify-private%20" +
    // "playlist-modify-public%20" +

    // "user-follow-modify%20" +
    "user-follow-read%20" +

    "user-read-playback-position%20" +
    "user-top-read%20" +
    "user-read-recently-played%20" +

    "user-library-modify%20" +
    "user-library-read%20" +

    "user-read-email%20" +
    "user-read-private"

export default function Login() {
    return (
        <div className="flex justify-center items-center min-h-screen">
            <a
                href={AUTH_URL}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg text-lg transition-colors duration-200"
            >
                Login with Spotify
            </a>
        </div>
    );
}