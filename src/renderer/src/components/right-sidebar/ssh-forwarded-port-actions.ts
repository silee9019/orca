import { parseExecutionHostId, type ExecutionHostId } from '../../../../shared/execution-host'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import { selectRepoByIdForActiveWorkspace } from '@/store/selectors'
import { useAppStore } from '@/store'
import { addressForPortForwardEntry } from '@/lib/workspace-port-urls'
import type { PortForwardEntry } from '../../../../shared/ssh-types'
const removing = new Set<string>()
export function portsConnectionId(
  workspaceId: string | undefined,
  hostId: ExecutionHostId | undefined,
  repoConnectionId: string | null | undefined
): string | null {
  if (hostId || (workspaceId && parseWorkspaceKey(workspaceId)?.type === 'folder')) {
    const host = parseExecutionHostId(hostId)
    return host?.kind === 'ssh' ? host.targetId : null
  }
  return repoConnectionId ?? null
}

export function readPortsConnectionId(): string | null {
  const current = useAppStore.getState()
  const workspace = current.activeWorktreeId
    ? current.getKnownWorktreeById(
        current.activeWorktreeId,
        current.activeWorkspaceExecutionHostId ?? undefined
      )
    : null
  const repo = selectRepoByIdForActiveWorkspace(current, workspace?.repoId ?? null)
  return portsConnectionId(workspace?.id, workspace?.hostId, repo?.connectionId)
}

export function findCurrentSshForward(id: string, targetId: string): PortForwardEntry | undefined {
  const current = useAppStore.getState()
  if (
    readPortsConnectionId() !== targetId ||
    current.sshConnectionStates.get(targetId)?.status !== 'connected'
  ) {
    return undefined
  }
  return current.portForwardsByConnection[targetId]?.find(
    (entry) => entry.id === id && entry.connectionId === targetId
  )
}
export async function copySshForwardAddress(entry: PortForwardEntry): Promise<boolean> {
  const canonical = findCurrentSshForward(entry.id, entry.connectionId)
  if (!canonical) {
    return false
  }
  try {
    await window.api.ui.writeClipboardText(addressForPortForwardEntry(canonical))
    return true
  } catch {
    return false
  }
}
export async function removeSshForward(entry: PortForwardEntry): Promise<boolean> {
  const key = JSON.stringify([entry.connectionId, entry.id])
  if (removing.has(key) || !findCurrentSshForward(entry.id, entry.connectionId)) {
    return false
  }
  removing.add(key)
  try {
    await window.api.ssh.removePortForward({ id: entry.id })
    const refreshed = await window.api.ssh.listPortForwards({ targetId: entry.connectionId })
    return !refreshed.some(
      (value) => value.id === entry.id && value.connectionId === entry.connectionId
    )
  } catch {
    return false
  } finally {
    removing.delete(key)
  }
}
