// LoadingOverlay.jsx

import React from 'react';

const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    zIndex: 9999,
    background: 'rgba(255,255,255,0.6)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
};

const spinnerStyle = {
    width: '100px',
    height: '100px',
    border: '12px solid #e0e0e0',
    borderTop: '12px solid #1db954',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '32px',
};

const textStyle = {
    fontSize: '2rem',
    color: '#222',
    fontWeight: 600,
    textAlign: 'center',
};

const styleSheet = `
@keyframes spin {
  0% { transform: rotate(0deg);}
  100% { transform: rotate(360deg);}
}
`;

export default function LoadingOverlay() {
    return (
        <>
            <style>{styleSheet}</style>
            <div style={overlayStyle}>
                <div style={spinnerStyle}></div>
                <div style={textStyle}>Fetching user data from Spotify...</div>
            </div>
        </>
    );
}