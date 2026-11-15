import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SelectionProvider } from './selection'

/** A fresh client per test, configured like main.tsx but without retries or caching between tests. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
}

export function queryWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }): React.JSX.Element {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

/** Renders `ui` inside a fresh query client and selection context, like main.tsx does. */
export function renderWithProviders(ui: ReactNode) {
  const client = createTestQueryClient()
  return { client, ...render(ui, { wrapper: providers(client) }) }
}

function providers(client: QueryClient) {
  return function Providers({ children }: { children: ReactNode }): React.JSX.Element {
    return (
      <QueryClientProvider client={client}>
        <SelectionProvider>{children}</SelectionProvider>
      </QueryClientProvider>
    )
  }
}
