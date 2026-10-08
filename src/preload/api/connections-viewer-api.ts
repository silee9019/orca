import type {
  ConnectionsViewerRequest,
  ConnectionsViewerResponse
} from '../../shared/connections-viewer'
export type ConnectionsViewerApi = {
  onRequest: (callback: (request: ConnectionsViewerRequest) => void) => () => void
  respond: (response: ConnectionsViewerResponse) => void
}
