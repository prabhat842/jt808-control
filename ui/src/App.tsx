import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider } from './api/config'
import Layout       from './components/Layout'
import CommandPage   from './pages/CommandPage'
import VehiclesPage from './pages/vehicles/VehiclesPage'
import AlarmsPage   from './pages/alarms/AlarmsPage'
import MediaPage    from './pages/media/MediaPage'
import ServicesPage from './pages/services/ServicesPage'
import ManagementPage from './pages/management/ManagementPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index           element={<CommandPage />} />
              <Route path="vehicles" element={<VehiclesPage />} />
              <Route path="alarms"   element={<AlarmsPage />} />
              <Route path="media"    element={<MediaPage />} />
              <Route path="services" element={<ServicesPage />} />
              <Route path="management" element={<ManagementPage />} />
            </Route>
          </Routes>
        </BrowserRouter>

      </ConfigProvider>
    </QueryClientProvider>
  )
}
