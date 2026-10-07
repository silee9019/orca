import { createElement, useRef, useState } from 'react'
import { BrowserPane } from '../../src/renderer/src/components/settings/BrowserPane'
import { useSettingsNavigationActions } from '../../src/renderer/src/components/settings/settings-view-model'
import { useAppStore } from '../../src/renderer/src/store'
import type { GlobalSettings } from '../../src/shared/global-settings-types'

export const browserNavigationFixture = {
  allowDiscard: false,
  confirmationCount: 0,
  section: '',
  scrollTarget: '',
  requestTick: 0
}
export function BrowserSettingsNavigationFixture({ settings }: { settings: GlobalSettings }) {
  const settingsSearchQuery = useAppStore((state) => state.settingsSearchQuery)
  const [requestTick, setPendingNavRequestTick] = useState(0)
  const contentScrollRef = useRef<HTMLDivElement>(null)
  const pendingNavSectionRef = useRef<string | null>(null)
  const pendingScrollTargetRef = useRef<string | null>(null)
  const actions = useSettingsNavigationActions(
    {
      activeSectionId: 'browser',
      setActiveSectionId: () => {},
      setPendingNavRequestTick,
      setSettingsSearchQuery: useAppStore.getState().setSettingsSearchQuery,
      settingsSearchQuery
    },
    {
      confirmDiscardSourceControlAiPromptChanges: async () => {
        browserNavigationFixture.confirmationCount += 1
        return browserNavigationFixture.allowDiscard
      },
      contentScrollRef,
      pendingNavSectionRef,
      pendingScrollTargetRef
    }
  )
  browserNavigationFixture.section = pendingNavSectionRef.current ?? ''
  browserNavigationFixture.scrollTarget = pendingScrollTargetRef.current ?? ''
  browserNavigationFixture.requestTick = requestTick
  return createElement(BrowserPane, {
    settings,
    updateSettings: () => {},
    onOpenComputerUse: actions.openComputerUseFromBrowser
  })
}
