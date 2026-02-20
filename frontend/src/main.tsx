import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PwaFeedback } from './components/PwaFeedback.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <PwaFeedback />
  </StrictMode>,
)
