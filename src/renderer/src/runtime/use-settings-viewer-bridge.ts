import { useEffect, useRef } from 'react'
import { useSettingsNavigationMetadata } from '@/hooks/useSettingsNavigationMetadata'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { useAppStore } from '@/store'
import { attachSettingsViewerBridge } from './settings-viewer-bridge'

export function useSettingsViewerBridge(): void {
  const sections = useSettingsNavigationMetadata()
  const runtimeContextKey = useAppStore((state) => getProviderRuntimeContextKey(state.settings))
  const catalog = useRef({ runtimeContextKey, sectionIds: sections.map((section) => section.id) })
  catalog.current = { runtimeContextKey, sectionIds: sections.map((section) => section.id) }
  useEffect(() => attachSettingsViewerBridge(window.api.ui, () => catalog.current), [])
}
