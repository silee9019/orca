import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type {
  ActivityViewerRequest,
  ActivityViewerResult
} from '../../../shared/activity-viewer-command'
import type { ActivityViewerCommand } from '../../../shared/rpc-contract/activity-viewer-params'
import { captureActivityThreadCommandTarget } from './activity-thread-command-target'
import { captureActivityThreadPreviewAction } from './activity-thread-preview-action'
import { isActivityDestinationVisible } from './activity-workspace-destination'
import { readActivityViewerView } from './activity-viewer-view'

export async function applyActivityThreadPreviewEditRequest(
  request: ActivityViewerRequest,
  command: Extract<ActivityViewerCommand, { operation: 'preview-edit' }>
): Promise<Omit<ActivityViewerResult, 'viewerId'>> {
  const context = captureActivityThreadCommandTarget(command.surface, command.paneKey)
  const { initial, thread, workspaceId, executionHostId, sameRuntime } = context
  if (initial.activeModal !== 'none' || document.querySelector('[role="dialog"]')) {
    throw new Error('activity_modal_already_open')
  }
  const preview = captureActivityThreadPreviewAction(context, command.field)
  let openedData: typeof initial.modalData | null = null
  let superseded = false
  let dialog: HTMLElement | null = null
  const expectedModal = (): boolean => {
    const state = useAppStore.getState()
    return (
      state.activeModal === 'edit-meta' &&
      state.modalData.worktreeId === workspaceId &&
      state.modalData.repoId === thread.worktree.repoId &&
      state.modalData.executionHostId === thread.worktree.hostId &&
      state.modalData.focus === command.field
    )
  }
  const observe = (): void => {
    context.observe()
    const state = useAppStore.getState()
    if (openedData === null) {
      if (expectedModal()) {
        openedData = state.modalData
      } else if (state.activeModal !== 'none') {
        superseded = true
      }
    } else if (!expectedModal() || state.modalData !== openedData) {
      superseded = true
    }
  }
  const ownedDialog = (): HTMLElement | null => {
    const node = document.querySelector<HTMLElement>(
      '[role="dialog"][data-worktree-meta-workspace]'
    )
    return node &&
      node.dataset.worktreeMetaWorkspace === workspaceId &&
      node.dataset.worktreeMetaRepo === thread.worktree.repoId &&
      node.dataset.worktreeMetaHost === executionHostId &&
      node.dataset.worktreeMetaFocus === command.field &&
      node.dataset.worktreeMetaSeedReady === 'true' &&
      isActivityDestinationVisible(node)
      ? node
      : null
  }
  const focusStatus = (): 'focused' | 'disabled' | 'unverified' => {
    if (!dialog) {
      return 'unverified'
    }
    const issueLabel = [...dialog.querySelectorAll<HTMLLabelElement>('label[for]')].find(
      (label) =>
        label.textContent?.trim() ===
        translate('auto.components.sidebar.WorktreeIssueLinkField.ad78f9bee2', 'Issue')
    )
    const input =
      command.field === 'comment'
        ? dialog.querySelector('textarea')
        : issueLabel
          ? document.getElementById(issueLabel.htmlFor)
          : null
    if (
      !(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) ||
      !dialog.contains(input) ||
      !isActivityDestinationVisible(input)
    ) {
      return 'unverified'
    }
    return input.disabled ? 'disabled' : document.activeElement === input ? 'focused' : 'unverified'
  }
  const stillExpected = (): boolean =>
    !superseded &&
    context.stillOwned() &&
    expectedModal() &&
    useAppStore.getState().modalData === openedData &&
    (!dialog || ownedDialog() === dialog)
  const recordDialogChanges = (records: MutationRecord[]): void => {
    if (
      dialog &&
      records.some(
        (record) =>
          (record.type === 'attributes' && record.target === dialog) ||
          (record.type === 'childList' &&
            [...record.removedNodes].some((node) => node === dialog || node.contains(dialog)))
      )
    ) {
      superseded = true
    }
  }
  const observer = new MutationObserver(recordDialogChanges)
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      'data-worktree-meta-workspace',
      'data-worktree-meta-repo',
      'data-worktree-meta-host',
      'data-worktree-meta-focus',
      'data-worktree-meta-seed-ready'
    ]
  })
  const unsubscribe = useAppStore.subscribe(observe)
  try {
    if (!context.stillExpected() || !preview.stillExpected()) {
      throw new Error('activity_preview_edit_unavailable')
    }
    preview.action.click()
    preview.dispose()
    observe()
    const deadline = Math.min(request.expiresAt - 25, Date.now() + 5000)
    while (!superseded && context.stillOwned() && Date.now() < deadline) {
      const current = ownedDialog()
      if (current) {
        if (dialog && current !== dialog) {
          superseded = true
          break
        }
        dialog = current
        if (focusStatus() !== 'unverified') {
          break
        }
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
      observe()
    }
    recordDialogChanges(observer.takeRecords())
    const available = stillExpected()
    const opened = available && dialog !== null && ownedDialog() === dialog
    const focus = opened ? focusStatus() : 'unverified'
    const applied = Date.now() < request.expiresAt && opened && focus !== 'unverified'
    return {
      viewer: 'host',
      surface: command.surface,
      dispatched: true,
      applied,
      persisted: null,
      writeOutcome: 'not_requested',
      groupBy: initial.agentsGroupBy,
      readFilter: initial.agentsReadFilter,
      compact: initial.agentsCompactMode,
      showChildAgents: initial.agentsShowChildAgents,
      rendered: sameRuntime() ? readActivityViewerView(command.surface) : null,
      editAction: { paneKey: command.paneKey, field: command.field, opened, focus },
      ...(!sameRuntime()
        ? { reason: 'viewer_runtime_changed' as const }
        : !available
          ? { reason: 'viewer_surface_superseded' as const }
          : !applied
            ? { reason: 'viewer_not_applied' as const }
            : {})
    }
  } finally {
    observer.disconnect()
    unsubscribe()
    preview.dispose()
  }
}
