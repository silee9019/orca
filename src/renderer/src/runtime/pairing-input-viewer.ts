import { useEffect, useRef } from 'react'
import { PairingInputViewerParams } from '../../../shared/pairing-input-viewer'
import type { ConnectionsViewerRequest } from '../../../shared/connections-viewer'
type PairingInputOwner = {
  surface: 'sidebar' | 'web'
  value: string
  disabled: boolean
  set: (value: string) => void
}
const owners = new Set<{ surface: PairingInputOwner['surface']; read: () => PairingInputOwner }>()
export function usePairingInputViewer(owner: PairingInputOwner): void {
  const committed = useRef(owner)
  useEffect(() => {
    committed.current = owner
  })
  useEffect(() => {
    const current = { surface: owner.surface, read: () => committed.current }
    owners.add(current)
    return () => {
      owners.delete(current)
    }
  }, [owner.surface])
}
export async function applyPairingInputViewerRequest(request: ConnectionsViewerRequest) {
  const command = PairingInputViewerParams.parse(request.command)
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  const selected = [...owners].filter((owner) => owner.surface === command.surface)
  if (selected.length > 1) {
    throw new Error('connections_viewer_ambiguous')
  }
  const owner = selected[0]
  if (!owner) {
    throw new Error('connections_surface_unavailable')
  }
  if (command.operation === 'pairing-input.set' && !owner.read().disabled) {
    owner.read().set(command.value)
    while (
      owners.has(owner) &&
      owner.read().value !== command.value &&
      Date.now() < request.expiresAt
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
  const current = owner.read()
  return {
    viewerId: command.viewerId,
    persisted: null,
    applied:
      owners.has(owner) &&
      Date.now() < request.expiresAt &&
      (command.operation === 'pairing-input.get' ||
        (!current.disabled && current.value === command.value)),
    state: { configured: current.value.length > 0, disabled: current.disabled }
  }
}
