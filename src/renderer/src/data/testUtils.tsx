import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { TooltipProvider } from '../ui'
import { TabsProvider, seedTabs } from './tabs'

/** A fresh client per test, configured like main.tsx but without retries or caching between tests. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
}

export function queryWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }): React.JSX.Element {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

export interface ProviderOptions {
  /**
   * Repository roots to put in the strip before rendering, with null for a Repositories tab.
   * Components that read or change the focused tab's view or selected change need one, since
   * on the backdrop there is no tab to hold either. The first is the focused tab.
   */
  tabs?: readonly (string | null)[]
}

/** Renders `ui` inside a fresh query client and tabs context, like main.tsx does. */
export function renderWithProviders(ui: ReactNode, options: ProviderOptions = {}) {
  if (options.tabs !== undefined) seedTabs(options.tabs)
  const client = createTestQueryClient()
  return { client, ...render(ui, { wrapper: providers(client) }) }
}

function providers(client: QueryClient) {
  return function Providers({ children }: { children: ReactNode }): React.JSX.Element {
    return (
      <QueryClientProvider client={client}>
        <TabsProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </TabsProvider>
      </QueryClientProvider>
    )
  }
}
