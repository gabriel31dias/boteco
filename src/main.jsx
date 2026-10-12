import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './app/index.css'
import './index.css'
import App from './App.jsx'
import { AppProvider } from './app/context/AppContext'
import { ChatProvider } from './app/context/ChatContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppProvider>
      <ChatProvider>
        <App />
      </ChatProvider>
    </AppProvider>
  </StrictMode>,
)
