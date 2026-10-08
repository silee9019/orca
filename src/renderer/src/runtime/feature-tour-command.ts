import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { FeatureTourParams } from '../../../shared/rpc-contract/feature-tour-params'
import type { FeatureTourRequest, FeatureTourResult } from '../../../shared/feature-tour-command'
import { isActivityDestinationVisible } from './activity-workspace-destination'
import { readSettingsViewerView } from './settings-viewer-view'
import { openFeatureTourFromHelp } from './feature-tour-open'

export async function applyFeatureTourRequest(
  request: FeatureTourRequest,
  rootAvailable: () => boolean
): Promise<Omit<FeatureTourResult, 'viewerId'>> {
  FeatureTourParams.parse(request.command)
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  const initial = useAppStore.getState()
  if (!initial.settings || !initial.persistedUIReady || !rootAvailable()) {
    throw new Error('viewer_not_ready')
  }
  if (initial.settings.activeRuntimeEnvironmentId) {
    throw new Error('viewer_runtime_mismatch')
  }
  const visible = (node: HTMLElement): boolean => {
    const bounds = node.getBoundingClientRect()
    return (
      isActivityDestinationVisible(node) &&
      bounds.right > 0 &&
      bounds.bottom > 0 &&
      bounds.left < window.innerWidth &&
      bounds.top < window.innerHeight
    )
  }
  const overlays = (): HTMLElement[] =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"][data-state="open"], [data-slot="select-content"], [data-slot="popover-content"], [data-slot="sheet-content"]'
      )
    ].filter(visible)
  if (initial.activeModal !== 'none' || overlays().length > 0) {
    throw new Error('viewer_modal_already_open')
  }
  if (readSettingsViewerView()?.hasUnsavedChanges) {
    throw new Error('unsaved_settings_changes')
  }
  const runtime = getProviderRuntimeContextKey(initial.settings)
  let openedData: typeof initial.modalData | null = null
  let superseded = false
  let ownedDialog: HTMLElement | null = null
  const observe = (): void => {
    const state = useAppStore.getState()
    if (
      !rootAvailable() ||
      !state.settings ||
      getProviderRuntimeContextKey(state.settings) !== runtime
    ) {
      superseded = true
    }
    if (state.activeModal !== 'feature-wall' || state.modalData.source !== 'help_menu') {
      superseded = true
    } else if (openedData === null) {
      openedData = state.modalData
    } else if (openedData !== state.modalData) {
      superseded = true
    }
  }
  const readContent = (): { dialog: HTMLElement | null; workflowId: string | null } => {
    const dialogs = [
      ...document.querySelectorAll<HTMLElement>('[role="dialog"][data-feature-tour-dialog="true"]')
    ]
    if (dialogs.length > 1) {
      superseded = true
    }
    const dialog =
      dialogs.length === 1 &&
      dialogs[0].dataset.featureTourSource === 'help_menu' &&
      visible(dialogs[0])
        ? dialogs[0]
        : null
    if (ownedDialog && dialog !== ownedDialog) {
      superseded = true
    }
    if (dialog && ownedDialog === null) {
      ownedDialog = dialog
    }
    if (!dialog || overlays().some((node) => node !== dialog && !dialog.contains(node))) {
      return { dialog: null, workflowId: null }
    }
    const tabs = [
      ...dialog.querySelectorAll<HTMLButtonElement>(
        'button[role="tab"][aria-selected="true"][data-feature-wall-workflow-id]'
      )
    ].filter(visible)
    const tab = tabs.length === 1 ? tabs[0] : null
    const panelId = tab?.getAttribute('aria-controls')
    const panel = panelId ? document.getElementById(panelId) : null
    const headingId = panel?.getAttribute('aria-labelledby')
    const heading = headingId ? document.getElementById(headingId) : null
    const contentReady =
      panel instanceof HTMLElement &&
      dialog.contains(panel) &&
      panel.getAttribute('role') === 'tabpanel' &&
      visible(panel) &&
      heading instanceof HTMLElement &&
      panel.contains(heading) &&
      heading.tagName === 'H3' &&
      !!heading.textContent?.trim() &&
      visible(heading)
    return {
      dialog,
      workflowId: contentReady ? (tab?.dataset.featureWallWorkflowId ?? null) : null
    }
  }
  const mutationObserver = new MutationObserver((records) => {
    if (!ownedDialog) {
      return
    }
    for (const record of records) {
      if (
        record.type === 'childList' &&
        [...record.removedNodes].some((node) => node === ownedDialog || node.contains(ownedDialog))
      ) {
        superseded = true
      }
      if (record.type === 'attributes' && record.target === ownedDialog) {
        superseded = true
      }
    }
  })
  mutationObserver.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      'role',
      'data-feature-tour-dialog',
      'data-feature-tour-source',
      'hidden',
      'inert',
      'aria-hidden'
    ]
  })
  const unsubscribe = useAppStore.subscribe(observe)
  try {
    openFeatureTourFromHelp()
    observe()
    const deadline = Math.min(request.expiresAt - 25, Date.now() + 5000)
    let content = readContent()
    while (!superseded && content.workflowId === null && Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
      observe()
      content = readContent()
    }
    observe()
    content = readContent()
    const applied = !superseded && Date.now() < deadline && content.workflowId !== null
    return {
      viewer: 'host',
      source: 'help_menu',
      applied,
      dialogPresent: content.dialog !== null,
      contentPresent: content.workflowId !== null,
      workflowId: content.workflowId,
      ...(!applied
        ? {
            reason: superseded
              ? ('viewer_surface_superseded' as const)
              : ('feature_tour_not_rendered' as const)
          }
        : {})
    }
  } finally {
    mutationObserver.disconnect()
    unsubscribe()
  }
}
