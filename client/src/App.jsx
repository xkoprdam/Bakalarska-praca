import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import Login from "./Login.jsx";
import Dashboard from "./Dashboard.jsx";

const code = new URLSearchParams(window.location.search).get('code');

function App() {
    return (
        code ? <Dashboard code={code} /> : <Login />
    );
}
export default App
