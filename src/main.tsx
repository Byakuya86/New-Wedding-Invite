import './index.css';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import RetroAudio from "./RetroAudio";

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <RetroAudio src="/audio/retro.mp3" startMuted={true} />
  </StrictMode>,
)
