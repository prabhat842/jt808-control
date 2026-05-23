import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { useQuery }  from '@tanstack/react-query'
import client from './client'

export interface UiConfig {
  rtvsUrl:      string
  mapboxToken:  string
  mapCenterLat: number
  mapCenterLon: number
  mapZoom:      number
}

const DEFAULTS: UiConfig = {
  rtvsUrl:      'http://localhost:8089',
  mapboxToken:  '',
  mapCenterLat: 22.8046,
  mapCenterLon: 86.2029,
  mapZoom:      11,
}

const ConfigContext = createContext<UiConfig>(DEFAULTS)

export function ConfigProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery<UiConfig>({
    queryKey: ['ui-config'],
    queryFn:  () => client.get('/config').then(r => r.data),
    staleTime: Infinity, // config doesn't change at runtime
  })
  return (
    <ConfigContext.Provider value={data ?? DEFAULTS}>
      {children}
    </ConfigContext.Provider>
  )
}

export function useConfig() {
  return useContext(ConfigContext)
}
