import type {
  WorkspaceFileOpenCommand,
  WorkspaceFileOpenState
} from '../../../shared/rpc-contract/workspace-file-open-params'
export class WorkspaceFileOpenEvent extends Event {
  readonly offers: (() => WorkspaceFileOpenState)[] = []
  constructor(
    readonly command: WorkspaceFileOpenCommand,
    readonly expiresAt: number
  ) {
    super('orca:workspace-file-open')
  }
}
export function requestWorkspaceFileOpen(
  command: WorkspaceFileOpenCommand,
  expiresAt: number
): WorkspaceFileOpenState {
  const event = new WorkspaceFileOpenEvent(command, expiresAt)
  window.dispatchEvent(event)
  if (event.offers.length !== 1) {
    throw new Error(
      event.offers.length ? 'workspace_file_owner_ambiguous' : 'workspace_file_owner_unavailable'
    )
  }
  return event.offers[0]()
}
