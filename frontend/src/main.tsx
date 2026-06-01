import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PwaFeedback } from './components/PwaFeedback.tsx'
import { ThemeProvider } from './components/theme-provider.tsx'
import { ViewProvider } from './components/view-context.tsx'
import { Toaster } from './components/ui/sonner.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="image-converter-theme">
      <ViewProvider>
        <App />
        <PwaFeedback />
        <Toaster />
      </ViewProvider>
    </ThemeProvider>
  </StrictMode>,
)
