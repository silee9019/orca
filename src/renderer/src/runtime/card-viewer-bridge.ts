import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { CardViewerParams } from '../../../shared/rpc-contract/card-viewer-params'
import { normalizeWorktreeCardProperties } from '../../../shared/worktree/card-properties'
import type {
  CardViewerRequest,
  CardViewerResult,
  CardViewerResponse
} from '../../../shared/card-viewer-command'
import { readCardViewerView } from './card-viewer-view'

export async function applyCardViewerRequest(
  request: CardViewerRequest
): Promise<Omit<CardViewerResult, 'viewerId'>> {
  const command = CardViewerParams.parse(request.command)
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  const initial = useAppStore.getState()
  if (!initial.settings || !initial.persistedUIReady) {
    throw new Error('viewer_not_ready')
  }
  if (initial.settings.activeRuntimeEnvironmentId) {
    throw new Error('viewer_runtime_mismatch')
  }
  if (
    command.operation === 'activity' &&
    initial.settings.experimentalNewWorktreeCardStyle === true
  ) {
    throw new Error('card_activity_unavailable')
  }
  if (command.operation !== 'get' && !window.api.ui.setWithAck) {
    throw new Error('persistence_ack_unavailable')
  }
  const runtime = getProviderRuntimeContextKey(initial.settings)
  const sameRuntime = (): boolean => {
    const state = useAppStore.getState()
    return state.settings !== null && getProviderRuntimeContextKey(state.settings) === runtime
  }
  const saving =
    command.operation === 'mode'
      ? initial.setWorktreeCardMode(command.mode)
      : command.operation === 'activity'
        ? initial.setAgentActivityDisplayMode(command.mode)
        : Promise.resolve()
  const expected = useAppStore.getState()
  const compact = expected.settings?.compactWorktreeCards ?? false
  const properties = normalizeWorktreeCardProperties(expected.worktreeCardProperties)
  const defaulted = expected._worktreeCardModeDefaulted
  const activityMode = expected.agentActivityDisplayMode
  const sameProperties = (values: readonly string[]): boolean =>
    JSON.stringify(normalizeWorktreeCardProperties(values)) === JSON.stringify(properties)
  const stillExpected = (): boolean => {
    const state = useAppStore.getState()
    return (
      sameRuntime() &&
      (command.operation === 'activity'
        ? state.agentActivityDisplayMode === activityMode
        : command.operation === 'get' ||
          (state.settings?.compactWorktreeCards === compact &&
            state._worktreeCardModeDefaulted === defaulted &&
            sameProperties(state.worktreeCardProperties)))
    )
  }
  await saving
  let persisted: boolean | null = null
  if (sameRuntime()) {
    const ui = await window.api.ui.get()
    if (sameRuntime()) {
      if (command.operation === 'activity') {
        persisted = ui.agentActivityDisplayMode === activityMode
      } else {
        const settings = await window.api.settings.get()
        if (sameRuntime()) {
          persisted =
            settings.compactWorktreeCards === compact &&
            ui._worktreeCardModeDefaulted === defaulted &&
            sameProperties(ui.worktreeCardProperties ?? [])
        }
      }
    }
  }
  const matches = (): boolean => {
    const cards = readCardViewerView()
    return (
      stillExpected() &&
      cards.length > 0 &&
      cards.every(
        (card) =>
          card.runtimeContextKey === runtime &&
          (command.operation === 'activity'
            ? card.activityMode === activityMode
            : sameProperties(card.properties) && card.compact === (card.newStyle ? false : compact))
      )
    )
  }
  const deadline = Math.min(request.expiresAt - 100, Date.now() + 5000)
  if (command.operation !== 'get' && readCardViewerView().length > 0) {
    while (stillExpected() && !matches() && Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25))
    }
  }
  const rendered = sameRuntime() ? readCardViewerView() : []
  const applied =
    Date.now() < request.expiresAt && sameRuntime() && (command.operation === 'get' || matches())
  return {
    viewer: 'host',
    dispatched: command.operation !== 'get',
    applied,
    persisted,
    compact,
    properties,
    defaulted,
    activityMode,
    rendered,
    ...(!sameRuntime()
      ? { reason: 'viewer_runtime_changed' as const }
      : !stillExpected()
        ? { reason: 'viewer_surface_superseded' as const }
        : !persisted
          ? { reason: 'persistence_superseded' as const }
          : !applied
            ? {
                reason:
                  rendered.length === 0
                    ? ('card_surface_unavailable' as const)
                    : ('viewer_not_applied' as const)
              }
            : {})
  }
}

export type CardViewerBridgeApi = {
  onCardViewerRequest?: (callback: (request: CardViewerRequest) => void) => () => void
  respondCardViewer?: (response: CardViewerResponse) => void
}
export function attachCardViewerBridge(api: CardViewerBridgeApi): () => void {
  if (!api.onCardViewerRequest || !api.respondCardViewer) {
    return () => {}
  }
  const respond = api.respondCardViewer
  let queue = Promise.resolve()
  let disposed = false
  const unsubscribe = api.onCardViewerRequest((request) => {
    queue = queue.then(async () => {
      if (disposed) {
        return
      }
      try {
        const result = await applyCardViewerRequest(request)
        if (!disposed) {
          respond({ id: request.id, ok: true, result: { ...result, viewerId: 0 } })
        }
      } catch (error) {
        if (!disposed) {
          respond({
            id: request.id,
            ok: false,
            error: error instanceof Error ? error.message : 'viewer_operation_failed'
          })
        }
      }
    })
  })
  return () => {
    disposed = true
    unsubscribe()
  }
}
