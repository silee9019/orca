import { setSshPortForwardManagement } from '../ssh/ssh-target-registry'
import { ipcMain } from 'electron'
import {
  enrichSshForwardEntries,
  getWorktreeIdsForConnection
} from '../ports/ssh-advertised-url-enrichment'
import { activeSessions } from './ssh-active-relay-sessions'
import {
  connectionManager,
  getCurrentMainWindow,
  persistedStore,
  portForwardManager
} from './ssh-ipc-context'
import { persistPortForwards } from './ssh-port-forward-persistence'
import { broadcastPortForwards, enrichDetected } from './ssh-renderer-broadcast'

export function registerSshPortForwardHandlers(): void {
  setSshPortForwardManagement({
    addPortForward: addManagedSshPortForward,
    updatePortForward: updateManagedSshPortForward,
    removePortForward: removeManagedSshPortForward,
    listPortForwards: listManagedSshPortForwards,
    listDetectedPorts: listManagedSshDetectedPorts
  })
  ipcMain.handle(
    'ssh:addPortForward',
    (
      _event,
      args: {
        targetId: string
        localPort: number
        remoteHost: string
        remotePort: number
        label?: string
      }
    ) => addManagedSshPortForward(args)
  )

  ipcMain.handle(
    'ssh:updatePortForward',
    (
      _event,
      args: {
        id: string
        targetId: string
        localPort: number
        remoteHost: string
        remotePort: number
        label?: string
      }
    ) => updateManagedSshPortForward(args)
  )

  ipcMain.handle('ssh:removePortForward', (_event, args: { id: string }) =>
    removeManagedSshPortForward(args)
  )

  ipcMain.handle('ssh:listPortForwards', (_event, args?: { targetId?: string }) =>
    listManagedSshPortForwards(args)
  )

  ipcMain.handle('ssh:listDetectedPorts', (_event, args: { targetId: string }) =>
    listManagedSshDetectedPorts(args)
  )
}

export async function addManagedSshPortForward(args: {
  targetId: string
  localPort: number
  remoteHost: string
  remotePort: number
  label?: string
}) {
  const conn = connectionManager!.getConnection(args.targetId)
  if (!conn) {
    throw new Error(`SSH connection "${args.targetId}" not found`)
  }
  const entry = await portForwardManager!.addForward(
    args.targetId,
    conn,
    args.localPort,
    args.remoteHost,
    args.remotePort,
    args.label
  )
  persistPortForwards(args.targetId)
  broadcastPortForwards(getCurrentMainWindow, args.targetId)
  return entry
}

export async function updateManagedSshPortForward(args: {
  id: string
  targetId: string
  localPort: number
  remoteHost: string
  remotePort: number
  label?: string
}) {
  const conn = connectionManager!.getConnection(args.targetId)
  if (!conn) {
    throw new Error(`SSH connection "${args.targetId}" not found`)
  }
  try {
    const entry = await portForwardManager!.updateForward(
      args.id,
      conn,
      args.localPort,
      args.remoteHost,
      args.remotePort,
      args.label
    )
    persistPortForwards(entry.connectionId)
    broadcastPortForwards(getCurrentMainWindow, entry.connectionId)
    return entry
  } catch (err) {
    // Why: edit/rollback may have failed, so resync renderer to actual runtime state.
    persistPortForwards(args.targetId)
    broadcastPortForwards(getCurrentMainWindow, args.targetId)
    throw err
  }
}

export async function removeManagedSshPortForward(args: { id: string }) {
  const removed = await portForwardManager!.removeForwardAndWait(args.id)
  if (removed) {
    persistPortForwards(removed.connectionId)
    broadcastPortForwards(getCurrentMainWindow, removed.connectionId)
  }
  return removed
}

export function listManagedSshPortForwards(args?: { targetId?: string }) {
  const all = portForwardManager!.listForwards(args?.targetId)
  if (!persistedStore || !args?.targetId) {
    // Why: cross-target entries can't be mapped to worktrees in one call, so serve the raw list.
    return all
  }
  return enrichSshForwardEntries(all, getWorktreeIdsForConnection(persistedStore, args.targetId))
}

export function listManagedSshDetectedPorts(args: { targetId: string }) {
  const session = activeSessions.get(args.targetId)
  const ports = session?.getPortScanner()?.getDetectedPorts(args.targetId) ?? []
  return enrichDetected(args.targetId, ports)
}
