import './styles/global.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { SelectionProvider } from './data'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Re-read git state when the window regains focus, like the Swift app did.
      refetchOnWindowFocus: true,
      retry: false
    }
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SelectionProvider>
        <App />
      </SelectionProvider>
    </QueryClientProvider>
  </StrictMode>
)
