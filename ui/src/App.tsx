import { useState, useCallback } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider } from './api/config'
import SplashScreen from './components/SplashScreen'
import Layout       from './components/Layout'
import FleetPage    from './pages/fleet/FleetPage'
import VehiclesPage from './pages/vehicles/VehiclesPage'
import AlarmsPage   from './pages/alarms/AlarmsPage'
import MediaPage    from './pages/media/MediaPage'
import ServicesPage from './pages/services/ServicesPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  const [ready, setReady] = useState(false)
  const onSplashComplete = useCallback(() => setReady(true), [])

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>

        {/* Splash renders on top until checks complete */}
        {!ready && <SplashScreen onComplete={onSplashComplete} />}

        {/* Main app — mounted immediately so map/data start loading behind splash */}
        <div style={{
          opacity: ready ? 1 : 0,
          transition: 'opacity 0.5s ease-in-out',
          height: '100vh',
          pointerEvents: ready ? 'auto' : 'none',
        }}>
          <HashRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index           element={<FleetPage />} />
                <Route path="vehicles" element={<VehiclesPage />} />
                <Route path="alarms"   element={<AlarmsPage />} />
                <Route path="media"    element={<MediaPage />} />
                <Route path="services" element={<ServicesPage />} />
              </Route>
            </Routes>
          </HashRouter>
        </div>

      </ConfigProvider>
    </QueryClientProvider>
  )
}
