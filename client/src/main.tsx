import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// ARCH-FIX: Ensure client/src/main.tsx imports "./index.css" to fix homepage missing brand marker
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);