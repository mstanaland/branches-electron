import './styles/global.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LucideProvider } from 'lucide-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { SelectionProvider, installWindowFocusListener } from './data'
import { TooltipProvider } from './ui'

// Electron keeps a background window "visible", so TanStack's own focus detection never fires.
installWindowFocusListener()

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
        <LucideProvider size={14} strokeWidth={2}>
          <TooltipProvider>
            <App />
          </TooltipProvider>
        </LucideProvider>
      </SelectionProvider>
    </QueryClientProvider>
  </StrictMode>
)
