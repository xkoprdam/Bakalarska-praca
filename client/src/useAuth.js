import {useEffect, useState} from 'react';
import axios from 'axios';

export default function useAuth(code) {
    const [accessToken, setAccessToken] = useState()
    const [refreshToken, setRefreshToken] = useState()
    const [expiresIn, setExpiresIn] = useState()

    useEffect(() => {
        if (!code) return;

        axios.post("http://localhost:3001/login", { code })
            .then(res => {
                // console.log("Got token response:", res.data);
                setAccessToken(res.data.accessToken);
                setRefreshToken(res.data.refreshToken);
                setExpiresIn(res.data.expiresIn);
                // setExpiresIn(61);
                window.history.pushState({}, null, "/");
            })
            .catch(err => {
                console.error("❌ useEffect login error:", err);
                window.location = '/';
            });
    }, [code]);

    useEffect(() => {
        if (!refreshToken || !expiresIn) return;

        const interval = setInterval(() => {

            axios
                .post("http://localhost:3001/refresh", { refreshToken })
                .then(res => {
                    setAccessToken(res.data.accessToken);
                    setExpiresIn(res.data.expiresIn);
                    // setExpiresIn(61);
                })
                .catch(err => {
                    console.error("❌ useEffect refresh error:", err);
                    window.location = '/';
                });
        }, ((expiresIn - 60) * 1000) )

        return () => clearInterval(interval);

    }, [refreshToken, expiresIn]);

    const logout = () => {
        setAccessToken(null);
        setRefreshToken(null);
        setExpiresIn(null);
        // window.localStorage.removeItem('spotify-auth'); // if you store tokens
        window.location.href = 'https://accounts.spotify.com/logout'; 
    };

    return { accessToken, logout }; // Return both token and logout function
}
