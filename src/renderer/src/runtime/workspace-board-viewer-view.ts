import type { WorkspaceBoardSnapshot } from '../../../shared/workspace-board-command'

export type WorkspaceBoardControl = {
  addStatus: () => void
  renameStatus: (statusId: string, label: string) => void
  changeStatusColor: (statusId: string, color: string) => void
  changeStatusIcon: (statusId: string, icon: string) => void
  moveStatus: (statusId: string, direction: -1 | 1) => void
  removeStatus: (statusId: string) => void
  setColumnWidth: (width: number) => void
  assignWorkspaces: (
    workspaceIds: readonly string[],
    statusId: string
  ) => { taskStatusSyncRequested: boolean }
}

let committed: WorkspaceBoardSnapshot | null = null
let control: WorkspaceBoardControl | null = null
export function publishWorkspaceBoardView(view: WorkspaceBoardSnapshot | null): void {
  committed = view
}
// Why: the board's own handlers close over its last render, so the CLI calls the published ones.
export function publishWorkspaceBoardControl(next: WorkspaceBoardControl | null): void {
  control = next
}
function readMeasuredBoard(): boolean {
  const node = document.querySelector<HTMLElement>('[data-workspace-board-selection-surface]')
  if (!node) {
    return false
  }
  const bounds = node.getBoundingClientRect()
  return bounds.width > 0 && bounds.height > 0
}
// Why: a drawer that is closing still lingers mounted, but it is no longer the board a user can act on.
export function readWorkspaceBoardView(): WorkspaceBoardSnapshot | null {
  return committed?.open && readMeasuredBoard() ? committed : null
}
export function readWorkspaceBoardControl(): WorkspaceBoardControl | null {
  return readWorkspaceBoardView() ? control : null
}
