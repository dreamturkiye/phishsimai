import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
// ARCH-FIX: import index.css so Vite emits /assets/*.css and homepage brand marker renders
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)