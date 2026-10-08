import { useEffect, useRef } from 'react'
import {
  SshPortsViewerParams,
  type SshPortsFormDraft,
  type SshPortsViewerState,
  type SshPortsViewerResult
} from '../../../shared/ssh-ports-viewer'
import type { ConnectionsViewerRequest } from '../../../shared/connections-viewer'
export type SshPortsFormOwner = {
  targetId: string
  draft: (value: SshPortsFormDraft) => boolean
  matches: (value: SshPortsFormDraft) => boolean
  save: () => Promise<boolean>
}
type PortsViewer = {
  form: () => SshPortsFormOwner | null
  read: () => SshPortsViewerState
  edit: (id: string) => boolean
  detected: (host: string, port: number) => boolean
  copy: (id: string) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  openBrowser: (id: string, destination: 'configured' | 'system' | 'orca') => Promise<boolean>
  removed: (id: string, targetId: string) => boolean
  cancel: () => void
  matchesDetected: (host: string, port: number) => boolean
  current: () => boolean
}
const panels = new Set<PortsViewer>()
export function useSshPortsViewer(owner: PortsViewer): void {
  const committed = useRef(owner)
  useEffect(() => {
    committed.current = owner
  })
  useEffect(() => {
    const panel: PortsViewer = {
      form: () => committed.current.form(),
      read: () => committed.current.read(),
      edit: (id) => committed.current.edit(id),
      detected: (host, port) => committed.current.detected(host, port),
      copy: (id) => committed.current.copy(id),
      remove: (id) => committed.current.remove(id),
      openBrowser: (id, destination) => committed.current.openBrowser(id, destination),
      removed: (id, targetId) => committed.current.removed(id, targetId),
      cancel: () => committed.current.cancel(),
      matchesDetected: (host, port) => committed.current.matchesDetected(host, port),
      current: () => committed.current.current()
    }
    panels.add(panel)
    return () => {
      panels.delete(panel)
    }
  }, [])
}
export async function applySshPortsViewerRequest(
  request: ConnectionsViewerRequest
): Promise<SshPortsViewerResult> {
  const parsed = SshPortsViewerParams.safeParse(request.command)
  if (!parsed.success) {
    throw new Error('invalid_connections_viewer_command')
  }
  if (panels.size > 1) {
    throw new Error('connections_viewer_ambiguous')
  }
  const panel = panels.values().next().value
  if (!panel) {
    throw new Error('connections_surface_unavailable')
  }
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  const command = parsed.data
  const initial = panel.read()
  if (
    command.operation === 'ssh-ports.cancel' ||
    command.operation === 'ssh-ports.draft' ||
    command.operation === 'ssh-ports.save'
  ) {
    if (initial.dialog === 'closed' || initial.dialogTargetId !== command.targetId) {
      throw new Error('ssh_port_dialog_mismatch')
    }
  } else if (
    initial.connectionId !== command.targetId ||
    initial.disconnected ||
    !panel.current()
  ) {
    throw new Error('ssh_port_target_unavailable')
  }
  let expected: Partial<SshPortsViewerState> = {}
  let succeeded = true
  let persisted: boolean | null = null
  const form = panel.form()
  switch (command.operation) {
    case 'ssh-ports.draft':
      if (!form || form.targetId !== command.targetId) {
        throw new Error('ssh_port_dialog_mismatch')
      }
      succeeded = form.draft(command.draft)
      break
    case 'ssh-ports.save':
      if (command.confirmTarget !== command.targetId) {
        throw new Error('confirm_target_mismatch')
      }
      if (!form || form.targetId !== command.targetId) {
        throw new Error('ssh_port_dialog_mismatch')
      }
      succeeded = await form.save()
      persisted = succeeded
      expected = { dialog: 'closed', dialogTargetId: null }
      break
    case 'ssh-ports.get':
      break
    case 'ssh-ports.copy':
      succeeded = await panel.copy(command.forwardId)
      break
    case 'ssh-ports.open-browser':
      succeeded = await panel.openBrowser(command.forwardId, command.destination ?? 'configured')
      break
    case 'ssh-ports.remove':
      if (command.forwardId !== command.confirmTarget) {
        throw new Error('confirm_target_mismatch')
      }
      succeeded = await panel.remove(command.forwardId)
      break
    case 'ssh-ports.edit':
      if (!panel.edit(command.forwardId)) {
        throw new Error('ssh_port_forward_not_found')
      }
      expected = {
        dialog: 'edit',
        dialogTargetId: command.targetId,
        editingForwardId: command.forwardId
      }
      break
    case 'ssh-ports.detected':
      if (!panel.detected(command.remoteHost, command.remotePort)) {
        throw new Error('ssh_detected_port_not_found')
      }
      expected = { dialog: 'add', dialogTargetId: command.targetId }
      break
    case 'ssh-ports.cancel':
      panel.cancel()
      expected = { dialog: 'closed', dialogTargetId: null }
      break
  }
  let state = panel.read()
  const matches = () =>
    (command.operation !== 'ssh-ports.draft' ||
      (panel.form() === form && form?.matches(command.draft) === true)) &&
    (command.operation !== 'ssh-ports.remove' ||
      panel.removed(command.forwardId, command.targetId)) &&
    (command.operation !== 'ssh-ports.detected' ||
      panel.matchesDetected(command.remoteHost, command.remotePort)) &&
    Object.entries(expected).every(([key, value]) => Reflect.get(state, key) === value)
  while (succeeded && !matches() && Date.now() < request.expiresAt && panels.has(panel)) {
    await new Promise((resolve) => setTimeout(resolve, 10))
    state = panel.read()
  }
  if (Date.now() >= request.expiresAt || !panels.has(panel)) {
    throw new Error('request_expired')
  }
  return { viewerId: command.viewerId, applied: succeeded && matches(), persisted, state }
}
