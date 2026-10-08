import { requestBrowserMarkupEditor } from './browser-markup-editor-request'
import type { BrowserViewerResult } from '../../../shared/browser-viewer-command'
import { useAppStore } from '@/store'
import { findPage } from '@/store/slices/browser-page-records'
import { matchesBrowserClientPageCommandTarget } from './browser-client-page-command-target'
import { requestBrowserMarkup } from './browser-markup-request'
import type { RuntimeBrowserClientPlacement } from '../../../shared/runtime-browser-placement'
import type {
  BrowserClientMarkupTarget,
  BrowserClientMarkupAction,
  BrowserClientMarkupReceipt
} from '../../../shared/rpc-contract/browser-client-markup-params'
export function isBrowserClientMarkupTargetCurrent(
  target: BrowserClientMarkupTarget,
  placement?: RuntimeBrowserClientPlacement | null
): boolean {
  const state = useAppStore.getState()
  const page = findPage(state.browserPagesByWorkspace, target.page)
  const workspace = state.browserTabsByWorktree[target.worktreeId]?.find(
    (workspace) => workspace.id === page?.workspaceId
  )
  return Boolean(
    state.persistedUIReady &&
    state.settings?.activeRuntimeEnvironmentId === target.environmentId &&
    state.activeModal === 'none' &&
    state.activeWorktreeId === target.worktreeId &&
    page?.worktreeId === target.worktreeId &&
    page.browserRuntimeEnvironmentId === target.environmentId &&
    workspace?.activePageId === target.page &&
    state.activeBrowserTabIdByWorktree[target.worktreeId] === workspace.id &&
    matchesBrowserClientPageCommandTarget(
      state.remoteBrowserPageHandlesByPageId[target.page],
      target.environmentId,
      target,
      placement
    )
  )
}
export async function requestBrowserClientMarkup(
  target: BrowserClientMarkupTarget,
  action: BrowserClientMarkupAction,
  expiresAt: number
): Promise<BrowserClientMarkupReceipt> {
  if (!isBrowserClientMarkupTargetCurrent(target)) {
    throw new Error('browser_client_markup_target_mismatch')
  }
  let copied = false
  if (action === 'copy') {
    const receipt = await requestBrowserMarkupEditor(
      target.page,
      { action: 'copy' },
      expiresAt,
      target
    )
    if (
      !receipt.copied ||
      !receipt.clientTarget ||
      !isBrowserClientMarkupTargetCurrent(target) ||
      Object.entries(target).some(
        ([key, value]) => Reflect.get(receipt.clientTarget ?? {}, key) !== value
      )
    ) {
      throw new Error('browser_client_markup_copy_effect_unknown')
    }
    copied = true
  }
  const result = await requestBrowserMarkup(
    target.page,
    action === 'copy' ? 'status' : action,
    expiresAt,
    target,
    action === 'copy' ? 'idle' : undefined
  )
  if (
    !isBrowserClientMarkupTargetCurrent(target) ||
    !result.clientTarget ||
    Object.entries(target).some(
      ([key, value]) => Reflect.get(result.clientTarget ?? {}, key) !== value
    )
  ) {
    throw new Error('browser_client_markup_owner_changed_effect_unknown')
  }
  if (copied && (result.state !== 'idle' || result.hasImage)) {
    throw new Error('browser_client_markup_copy_effect_unknown')
  }
  return {
    ...target,
    action,
    state: result.state,
    hasImage: result.hasImage,
    ...(copied ? { copied: true as const } : {}),
    accepted: true
  }
}

export async function applyBrowserClientMarkupRequest(
  command: { target: BrowserClientMarkupTarget; action: BrowserClientMarkupAction },
  expiresAt: number
): Promise<BrowserViewerResult> {
  const clientMarkup = await requestBrowserClientMarkup(command.target, command.action, expiresAt)
  return {
    viewer: 'host',
    viewerId: 0,
    persisted: false,
    rendered: false,
    page: command.target.page,
    clientMarkup,
    applied: true
  }
}
