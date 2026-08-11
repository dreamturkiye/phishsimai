import './index.css'; // ARCH-FIX: import index.css so Vite emits /assets/*.css and homepage receives brand styles
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);