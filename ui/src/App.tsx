import { HashRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider } from './api/config'
import Layout       from './components/Layout'
import FleetPage    from './pages/fleet/FleetPage'
import VehiclesPage from './pages/vehicles/VehiclesPage'
import AlarmsPage   from './pages/alarms/AlarmsPage'
import MediaPage    from './pages/media/MediaPage'
import ServicesPage from './pages/services/ServicesPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,           // don't retry on 503 — backend may be intentionally stopped
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index             element={<FleetPage />} />
            <Route path="vehicles"   element={<VehiclesPage />} />
            <Route path="alarms"     element={<AlarmsPage />} />
            <Route path="media"      element={<MediaPage />} />
            <Route path="services"   element={<ServicesPage />} />
          </Route>
        </Routes>
      </HashRouter>
      </ConfigProvider>
    </QueryClientProvider>
  )
}
