import type { ConnectionsViewerCommand } from '../../shared/rpc-contract/connections-viewer-params'
import type { ConnectionsViewerResult } from '../../shared/connections-viewer'
const viewers = new Map<
  number,
  (command: ConnectionsViewerCommand) => Promise<ConnectionsViewerResult>
>()
export function registerConnectionsViewerManagement(
  viewerId: number,
  request: (command: ConnectionsViewerCommand) => Promise<ConnectionsViewerResult>
): () => void {
  viewers.set(viewerId, request)
  return () => {
    if (viewers.get(viewerId) === request) {
      viewers.delete(viewerId)
    }
  }
}
export function requestConnectionsViewer(
  command: ConnectionsViewerCommand
): Promise<ConnectionsViewerResult> {
  const request = viewers.get(command.viewerId)
  if (!request) {
    throw new Error('renderer_unavailable')
  }
  return request(command)
}
