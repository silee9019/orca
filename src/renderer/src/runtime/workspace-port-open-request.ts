import type {
  WorkspacePortOpenCommand,
  WorkspacePortOpenState
} from '../../../shared/rpc-contract/workspace-port-open-params'
export class WorkspacePortOpenEvent extends Event {
  readonly offers: (() => Promise<WorkspacePortOpenState>)[] = []
  constructor(
    readonly command: WorkspacePortOpenCommand,
    readonly expiresAt: number
  ) {
    super('orca:workspace-port-open')
  }
}
export async function requestWorkspacePortOpen(
  command: WorkspacePortOpenCommand,
  expiresAt: number
): Promise<WorkspacePortOpenState> {
  const event = new WorkspacePortOpenEvent(command, expiresAt)
  window.dispatchEvent(event)
  if (event.offers.length !== 1) {
    throw new Error(
      event.offers.length ? 'workspace_port_owner_ambiguous' : 'workspace_port_owner_unavailable'
    )
  }
  return event.offers[0]()
}
