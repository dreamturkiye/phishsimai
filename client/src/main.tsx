import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css' // ARCH-FIX: ensure index.css import for E2E brand marker + HealTestE2EMarker visibility in Vite build
import { StrictMode } from 'react'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)