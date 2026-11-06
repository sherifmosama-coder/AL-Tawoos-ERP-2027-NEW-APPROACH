import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App.jsx'
import { NotificationProvider } from './context/NotificationContext'
import { initOneSignal } from './utils/oneSignalEngine'

// Initialize OneSignal Web Push SDK
initOneSignal();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <NotificationProvider>
      <App />
    </NotificationProvider>
  </StrictMode>,
)
