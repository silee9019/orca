import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { CrashReportParams } from '../../../shared/rpc-contract/crash-report-params'
import type { CrashReportRequest, CrashReportResult } from '../../../shared/crash-report-command'
import { assertHelpModalOpenAvailable } from './help-modal-open-lease'
import {
  readCrashReportOpenSurface,
  subscribeCrashReportOpenSurface
} from './crash-report-open-surface'
import { observeViewerDialogIdentity } from './viewer-dialog-identity'

export async function applyCrashReportRequest(
  request: CrashReportRequest,
  rootAvailable: () => boolean
): Promise<Omit<CrashReportResult, 'viewerId'>> {
  CrashReportParams.parse(request.command)
  const { initial, visible, overlays } = assertHelpModalOpenAvailable(
    request.expiresAt,
    rootAvailable
  )
  const surface = readCrashReportOpenSurface()
  if (!surface) {
    throw new Error('viewer_not_ready')
  }
  const runtime = getProviderRuntimeContextKey(initial.settings)
  const deadline = Math.min(request.expiresAt - 25, Date.now() + 5000)
  let epoch: number | null = null
  let superseded = false
  let ownedDialog: HTMLElement | null = null
  const observe = (): void => {
    const state = useAppStore.getState()
    if (
      !rootAvailable() ||
      !state.settings ||
      !state.persistedUIReady ||
      getProviderRuntimeContextKey(state.settings) !== runtime ||
      state.activeModal !== 'none' ||
      readCrashReportOpenSurface() !== surface ||
      (epoch !== null && !surface.isCurrent(epoch))
    ) {
      superseded = true
    }
  }
  const readContent = (): {
    dialog: HTMLElement | null
    contentState: 'loading' | 'empty' | 'report' | null
  } => {
    const dialogs = [
      ...document.querySelectorAll<HTMLElement>('[role="dialog"][data-crash-report-dialog="true"]')
    ]
    if (dialogs.length > 1) {
      superseded = true
    }
    const dialog =
      dialogs.length === 1 &&
      dialogs[0].dataset.crashReportOpen === 'true' &&
      dialogs[0].dataset.crashReportSource === 'help_menu' &&
      dialogs[0].dataset.crashReportEpoch === String(epoch) &&
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
      return { dialog: null, contentState: null }
    }
    const title = dialog.querySelector<HTMLElement>('[data-slot="dialog-title"]')
    const description = dialog.querySelector<HTMLElement>('[data-slot="dialog-description"]')
    const notes = dialog.querySelector('textarea[data-crash-report-notes="true"]')
    const actions = [
      ...dialog.querySelectorAll<HTMLButtonElement>('button[data-crash-report-action]')
    ]
    const state = dialog.dataset.crashReportContentState
    const ready =
      title instanceof HTMLElement &&
      !!title.textContent?.trim() &&
      visible(title) &&
      description instanceof HTMLElement &&
      !!description.textContent?.trim() &&
      visible(description) &&
      notes instanceof HTMLTextAreaElement &&
      visible(notes) &&
      actions.length === 3 &&
      ['copy', 'dismiss', 'send'].every(
        (kind) =>
          actions.filter((action) => action.dataset.crashReportAction === kind && visible(action))
            .length === 1
      )
    return {
      dialog,
      contentState:
        ready && (state === 'loading' || state === 'empty' || state === 'report') ? state : null
    }
  }
  const observer = observeViewerDialogIdentity(
    () => ownedDialog,
    () => {
      superseded = true
    },
    [
      'role',
      'data-crash-report-dialog',
      'data-crash-report-open',
      'data-crash-report-source',
      'data-crash-report-epoch',
      'hidden',
      'inert',
      'aria-hidden'
    ]
  )
  const unsubscribe = useAppStore.subscribe(observe)
  const unpublish = subscribeCrashReportOpenSurface(observe)
  try {
    epoch = surface.openFromHelp()
    observe()
    let content = readContent()
    while (!superseded && content.contentState === null && Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
      observe()
      content = readContent()
    }
    observe()
    content = readContent()
    const applied = !superseded && Date.now() < deadline && content.contentState !== null
    return {
      viewer: 'host',
      source: 'help_menu',
      applied,
      dialogPresent: content.dialog !== null,
      contentPresent: content.contentState !== null,
      contentState: content.contentState,
      ...(!applied
        ? {
            reason: superseded
              ? ('viewer_surface_superseded' as const)
              : ('crash_report_not_rendered' as const)
          }
        : {})
    }
  } finally {
    observer.disconnect()
    unsubscribe()
    unpublish()
  }
}
