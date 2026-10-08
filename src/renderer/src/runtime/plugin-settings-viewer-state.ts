import { useEffect, useLayoutEffect, useRef } from 'react'
import type { PluginHostListEntry } from '../../../preload/api-types'
import type { PluginLogsState } from '../components/settings/PluginSettingsRow'

export type PluginSettingsViewerPage = {
  mounted: boolean
  featureEnabled: boolean
  settingsBusy: boolean
  loading: boolean
  error: string | null
  plugins: readonly PluginHostListEntry[]
  busyPluginKeys: ReadonlySet<string>
  installOpen: boolean
  consentPluginId: string | null
  removePluginId: string | null
  rollbackPluginId: string | null
  openLogs: ReadonlySet<string>
  logsByPlugin: Readonly<Record<string, PluginLogsState>>
  refresh: () => Promise<PluginHostListEntry[] | null>
  toggleEnabled: (plugin: PluginHostListEntry) => Promise<boolean>
  toggleLogs: (pluginKey: string) => void
  openInstall: () => void
  review: (pluginKey: string) => void
  remove: (pluginKey: string) => void
  rollback: (pluginKey: string) => void
  confirmRemove: (pluginKey: string) => Promise<boolean>
  confirmRollback: (pluginKey: string) => Promise<boolean>
  cancelRemove: () => void
  cancelRollback: () => void
}
const mountedRows = new Set<{ current: string }>()
export function usePluginSettingsViewerRow(pluginKey: string): void {
  const key = useRef(pluginKey)
  useLayoutEffect(() => {
    key.current = pluginKey
  })
  useEffect(() => {
    mountedRows.add(key)
    return () => {
      mountedRows.delete(key)
    }
  }, [])
}
export function rowCount(pluginKey: string): number {
  return [...mountedRows].filter((key) => key.current === pluginKey).length
}
export function snapshot(page: PluginSettingsViewerPage) {
  return {
    viewer: 'desktop' as const,
    executionHost: 'local' as const,
    committed: true as const,
    featureEnabled: page.featureEnabled,
    settingsBusy: page.settingsBusy,
    loading: page.loading,
    error: page.error,
    plugins: page.plugins,
    pluginKeys: page.plugins.map((plugin) => plugin.pluginKey),
    visiblePluginKeys: page.plugins
      .filter((plugin) => rowCount(plugin.pluginKey) === 1)
      .map((plugin) => plugin.pluginKey),
    busyPluginKeys: [...page.busyPluginKeys],
    installOpen: page.installOpen,
    consentPluginId: page.consentPluginId,
    removePluginId: page.removePluginId,
    rollbackPluginId: page.rollbackPluginId,
    openLogs: [...page.openLogs],
    logs: page.logsByPlugin
  }
}
