import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from './App.js'
import { applyTextSize, loadTextSize } from './hooks/textScale.js'
import './app.css'

// Before the first render, so the page never flashes at the wrong size.
applyTextSize(loadTextSize())

// A LAN server that is occasionally absent: keep data fresh but don't hammer.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
