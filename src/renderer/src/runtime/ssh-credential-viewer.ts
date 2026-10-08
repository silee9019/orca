import { useEffect, useRef } from 'react'
import { SshCredentialViewerParams } from '../../../shared/ssh-credential-viewer'
import type { ConnectionsViewerRequest } from '../../../shared/connections-viewer'
type CredentialOwner = {
  requestId: string | null
  targetId: string | null
  value: string
  busy: () => boolean
  isCurrent: () => boolean
  draft: (value: string) => void
  submit: () => Promise<boolean>
  cancel: () => Promise<boolean>
}
const owners = new Set<{ read: () => CredentialOwner }>()
export function useSshCredentialViewer(owner: CredentialOwner): void {
  const committed = useRef(owner)
  useEffect(() => {
    committed.current = owner
  })
  useEffect(() => {
    const entry = { read: () => committed.current }
    owners.add(entry)
    return () => {
      owners.delete(entry)
    }
  }, [])
}
export async function applySshCredentialViewerRequest(request: ConnectionsViewerRequest) {
  const command = SshCredentialViewerParams.parse(request.command)
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  const matches = [...owners].filter((entry) => {
    const state = entry.read()
    return (
      state.isCurrent() &&
      state.requestId === command.requestId &&
      state.targetId === command.targetId
    )
  })
  if (matches.length > 1) {
    throw new Error('connections_viewer_ambiguous')
  }
  const owner = matches[0]
  if (!owner) {
    throw new Error('connections_surface_unavailable')
  }
  const initial = owner.read()
  let applied = command.operation === 'ssh-credential.get'
  if (!initial.busy()) {
    if (command.operation === 'ssh-credential.draft') {
      initial.draft(command.value)
      while (owners.has(owner) && Date.now() < request.expiresAt) {
        const current = owner.read()
        if (
          !current.isCurrent() ||
          current.requestId !== command.requestId ||
          current.targetId !== command.targetId
        ) {
          break
        }
        if (current.value === command.value) {
          applied = true
          break
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 10))
      }
    } else if (command.operation !== 'ssh-credential.get') {
      if (command.confirmTarget !== command.requestId) {
        throw new Error('confirm_target_mismatch')
      }
      applied =
        command.operation === 'ssh-credential.submit'
          ? initial.value === command.value && (await initial.submit())
          : await initial.cancel()
    }
  }
  if (
    applied &&
    (command.operation === 'ssh-credential.submit' || command.operation === 'ssh-credential.cancel')
  ) {
    while (
      owners.has(owner) &&
      owner.read().requestId === command.requestId &&
      Date.now() < request.expiresAt
    ) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10))
    }
  }
  const current = owner.read()
  return {
    viewerId: command.viewerId,
    persisted: null,
    applied: applied && owners.has(owner) && Date.now() < request.expiresAt,
    state: {
      open: current.requestId !== null,
      configured: current.value.length > 0,
      busy: current.busy()
    }
  }
}
