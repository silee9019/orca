import { useAppStore } from '@/store'
import { ActivityViewerParams } from '../../../shared/rpc-contract/activity-viewer-params'
import type { ActivityViewerRequest } from '../../../shared/activity-viewer-command'

export function readActivityViewerCommandContext(request: ActivityViewerRequest) {
  const command = ActivityViewerParams.parse(request.command)
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  const initial = useAppStore.getState()
  if (!initial.persistedUIReady || !initial.settings) {
    throw new Error('viewer_not_ready')
  }
  if (initial.settings.activeRuntimeEnvironmentId) {
    throw new Error('viewer_runtime_mismatch')
  }
  const localSearch = command.operation === 'search' || command.operation === 'search-clear'
  const markAllRead = command.operation === 'mark-all-read'
  const threadRead = command.operation === 'read-toggle' || command.operation === 'read-toggle-many'
  const completed =
    command.operation === 'clear-completed' ||
    command.operation === 'clear-thread' ||
    command.operation === 'clear-threads'
  return { command, initial, localSearch, markAllRead, threadRead, completed }
}
