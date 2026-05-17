import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router'
import { Header } from './components/Header'
import { AppLayout } from './components/layout/AppLayout'
import { useAuthStore } from './stores/authStore'
import { LoginPage } from './routes/login'
import { BoardsListPage } from './routes/boards-list'
import { BoardPage } from './routes/board'
import { RulesPage } from './routes/rules'

const rootRoute = createRootRoute({
  component: () => (
    <AppLayout>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Header />
        <main style={{ flex: 1, position: 'relative' }}>
          <Outlet />
        </main>
      </div>
    </AppLayout>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    const hasSession = !!useAuthStore.getState().accessToken
    throw redirect({ to: hasSession ? '/boards' : '/login' })
  },
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

const boardsListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/boards',
  beforeLoad: () => {
    if (!useAuthStore.getState().accessToken) throw redirect({ to: '/login' })
  },
  component: BoardsListPage,
})

const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/boards/$boardId',
  beforeLoad: () => {
    if (!useAuthStore.getState().accessToken) throw redirect({ to: '/login' })
  },
  component: BoardPage,
})

const rulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/boards/$boardId/rules',
  beforeLoad: () => {
    if (!useAuthStore.getState().accessToken) throw redirect({ to: '/login' })
  },
  component: RulesPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  boardsListRoute,
  boardRoute,
  rulesRoute,
])

export const router = createRouter({ routeTree, defaultPreload: 'intent' })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
