import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { publishSettingsViewerView } from '@/runtime/settings-viewer-view'
import type { SettingsStoreModel } from './use-settings-store-model'
import type { SettingsInteractionController } from './use-settings-interaction-controller'
import type { SettingsNavigationModel } from './use-settings-navigation-model'

export function useSettingsViewerPublication(
  model: SettingsStoreModel,
  interactions: SettingsInteractionController,
  navigation: SettingsNavigationModel
): void {
  const queryInput = useAppStore((state) => state.settingsSearchInputQuery)
  const runtimeContextKey = useAppStore((state) => getProviderRuntimeContextKey(state.settings))
  useEffect(() => {
    const container = interactions.contentScrollRef.current
    if (!container) {
      return
    }
    const publish = (): void => {
      const sections = [
        ...container.querySelectorAll<HTMLElement>('[data-settings-section]')
      ].filter((node) => node.getClientRects().length > 0)
      const targets = [
        ...container.querySelectorAll<HTMLElement>('[id], [data-settings-section]')
      ].filter((node) => node.getClientRects().length > 0)
      publishSettingsViewerView({
        runtimeContextKey,
        activeSectionId: model.activeSectionId,
        queryInput,
        queryApplied: model.settingsSearchQuery,
        visibleSectionIds: navigation.visibleNavSections.map((section) => section.id),
        renderedSectionIds: sections.map((node) => node.dataset.settingsSection ?? ''),
        renderedTargetIds: targets
          .flatMap((node) => [node.id, node.dataset.settingsSection ?? ''])
          .filter(Boolean),
        navigationPending:
          interactions.pendingNavSectionRef.current !== null ||
          interactions.pendingScrollTargetRef.current !== null ||
          interactions.pendingSubsectionScrollFrameRef.current !== null,
        hasUnsavedChanges: interactions.hasUnsavedSourceControlAiPromptChanges
      })
    }
    const observer = new MutationObserver(publish)
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['id', 'data-settings-section', 'hidden', 'data-state']
    })
    publish()
    const frame = requestAnimationFrame(publish)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      publishSettingsViewerView(null)
    }
  }, [
    interactions.pendingNavSectionRef,
    interactions.pendingScrollTargetRef,
    interactions.pendingSubsectionScrollFrameRef,
    interactions.contentScrollRef,
    interactions.hasUnsavedSourceControlAiPromptChanges,
    model.activeSectionId,
    model.pendingNavRequestTick,
    model.settingsSearchQuery,
    navigation.visibleNavSections,
    queryInput,
    runtimeContextKey
  ])
}
