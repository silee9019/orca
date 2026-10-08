import { useEffect, useRef } from 'react'
import {
  RuntimeServerViewerParams,
  type RuntimeServerViewerResult,
  type RuntimeServerViewerState
} from '../../../shared/runtime-server-viewer'
import type { ConnectionsViewerRequest } from '../../../shared/connections-viewer'
type ServerOwner = {
  read: () => RuntimeServerViewerState
  refresh: () => Promise<object | null>
  matchesRefresh: (result: object) => boolean
  add: (name: string, pairingCode: string, allowLoopback: boolean) => Promise<boolean>
  connect: (id: string) => Promise<boolean>
  disconnect: (id: string) => Promise<boolean>
  removeOpen: (id: string) => boolean
  removeCancel: () => void
  removeConfirm: () => Promise<boolean>
  hasEnvironment: (id: string) => boolean
  updates: (open: boolean) => void
}
const owners = new Set<ServerOwner>()
export function useRuntimeServerViewer(owner: ServerOwner): void {
  const committed = useRef(owner)
  useEffect(() => {
    committed.current = owner
  })
  useEffect(() => {
    const current: ServerOwner = {
      read: () => committed.current.read(),
      refresh: () => committed.current.refresh(),
      matchesRefresh: (result) => committed.current.matchesRefresh(result),
      add: (name, code, allow) => committed.current.add(name, code, allow),
      connect: (id) => committed.current.connect(id),
      disconnect: (id) => committed.current.disconnect(id),
      removeOpen: (id) => committed.current.removeOpen(id),
      removeCancel: () => committed.current.removeCancel(),
      removeConfirm: () => committed.current.removeConfirm(),
      hasEnvironment: (id) => committed.current.hasEnvironment(id),
      updates: (open) => committed.current.updates(open)
    }
    owners.add(current)
    return () => {
      owners.delete(current)
    }
  }, [])
}
export async function applyRuntimeServerViewerRequest(
  request: ConnectionsViewerRequest
): Promise<RuntimeServerViewerResult> {
  const parsed = RuntimeServerViewerParams.safeParse(request.command)
  if (!parsed.success) {
    throw new Error('invalid_connections_viewer_command')
  }
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  if (owners.size > 1) {
    throw new Error('connections_viewer_ambiguous')
  }
  const owner = owners.values().next().value
  if (!owner) {
    throw new Error('connections_surface_unavailable')
  }
  const command = parsed.data
  if (command.operation !== 'runtime-server.get' && (!owner.read().visible || owner.read().busy)) {
    throw new Error('connections_surface_unavailable')
  }
  let applied = true
  let matches = () => true
  switch (command.operation) {
    case 'runtime-server.get':
      break
    case 'runtime-server.refresh': {
      const result = await owner.refresh()
      applied = result !== null
      matches = () => result === null || owner.matchesRefresh(result)
      break
    }
    case 'runtime-server.add':
      if (!owner.read().addFormOpen) {
        throw new Error('connections_surface_unavailable')
      }
      applied = await owner.add(command.name, command.pairingCode, command.allowLoopback)
      matches = () => !applied || !owner.read().addFormOpen
      break
    case 'runtime-server.connect':
    case 'runtime-server.disconnect':
      if (!owner.hasEnvironment(command.environmentId)) {
        throw new Error('environment_not_found')
      }
      applied =
        command.operation === 'runtime-server.connect'
          ? await owner.connect(command.environmentId)
          : await owner.disconnect(command.environmentId)
      matches = () => !owner.read().busy
      break
    case 'runtime-server.remove-open':
      applied = owner.removeOpen(command.environmentId)
      matches = () => !applied || owner.read().pendingRemoveId === command.environmentId
      break
    case 'runtime-server.remove-cancel':
      owner.removeCancel()
      matches = () => owner.read().pendingRemoveId === null && !owner.read().removeErrorSet
      break
    case 'runtime-server.remove-confirm':
      if (owner.read().pendingRemoveId !== command.confirmTarget) {
        throw new Error('confirm_target_mismatch')
      }
      applied = await owner.removeConfirm()
      matches = () =>
        !applied ||
        (!owner.hasEnvironment(command.confirmTarget) && owner.read().pendingRemoveId === null)
      break
    case 'runtime-server.updates':
      owner.updates(command.open)
      matches = () => owner.read().updatesOpen === command.open
      break
  }
  await new Promise((resolve) => setTimeout(resolve, 0))
  while (!matches() && owners.has(owner) && Date.now() < request.expiresAt) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  if (!owners.has(owner) || Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  return {
    viewerId: command.viewerId,
    applied: applied && matches(),
    persisted: null,
    state: owner.read()
  }
}
