import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { isActivityDestinationVisible } from './activity-workspace-destination'
import { readSettingsViewerView } from './settings-viewer-view'

export function acquireHelpModalOpenLease(
  kind: 'feature-tour' | 'setup-guide',
  expiresAt: number,
  rootAvailable: () => boolean
) {
  if (Date.now() >= expiresAt) {
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
  const modal = kind === 'feature-tour' ? 'feature-wall' : 'setup-guide'
  const sourceKey = kind === 'feature-tour' ? 'source' : 'telemetrySource'
  const marker = kind === 'feature-tour' ? 'data-feature-tour-dialog' : 'data-setup-guide-dialog'
  const sourceMarker =
    kind === 'feature-tour' ? 'data-feature-tour-source' : 'data-setup-guide-source'
  const runtime = getProviderRuntimeContextKey(initial.settings)
  let openedData: typeof initial.modalData | null = null
  let superseded = false
  let ownedDialog: HTMLElement | null = null
  const observe = (): void => {
    const state = useAppStore.getState()
    if (
      !rootAvailable() ||
      !state.settings ||
      !state.persistedUIReady ||
      getProviderRuntimeContextKey(state.settings) !== runtime
    ) {
      superseded = true
    }
    if (state.activeModal !== modal || state.modalData[sourceKey] !== 'help_menu') {
      superseded = true
    } else if (openedData === null) {
      openedData = state.modalData
    } else if (openedData !== state.modalData) {
      superseded = true
    }
  }
  const readDialog = (): HTMLElement | null => {
    const dialogs = [...document.querySelectorAll<HTMLElement>(`[role="dialog"][${marker}="true"]`)]
    if (dialogs.length > 1) {
      superseded = true
    }
    const dialog =
      dialogs.length === 1 &&
      dialogs[0].getAttribute(sourceMarker) === 'help_menu' &&
      (kind !== 'setup-guide' || dialogs[0].dataset.setupGuideOpen === 'true') &&
      visible(dialogs[0])
        ? dialogs[0]
        : null
    if (ownedDialog && dialog !== ownedDialog) {
      superseded = true
    }
    if (dialog && ownedDialog === null) {
      ownedDialog = dialog
    }
    return dialog && !overlays().some((node) => node !== dialog && !dialog.contains(node))
      ? dialog
      : null
  }
  const observer = new MutationObserver((records) => {
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
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      'role',
      marker,
      sourceMarker,
      'data-setup-guide-open',
      'hidden',
      'inert',
      'aria-hidden'
    ]
  })
  const unsubscribe = useAppStore.subscribe(observe)
  return {
    visible,
    observe,
    readDialog,
    isSuperseded: (): boolean => superseded,
    deadline: Math.min(expiresAt - 25, Date.now() + 5000),
    release: (): void => {
      observer.disconnect()
      unsubscribe()
    }
  }
}
