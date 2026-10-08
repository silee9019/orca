import { useEffect, useRef } from 'react'
import {
  MobileDriverViewerParams,
  type MobileDriverViewerResult
} from '../../../shared/mobile-driver-viewer'
import type { ConnectionsViewerRequest } from '../../../shared/connections-viewer'
type DriverOverlay = {
  ptyId: string | undefined
  visible: boolean
  current: () => boolean
  read: () => MobileDriverViewerResult['state']
  collapse: (collapsed: boolean) => boolean
  restore: (all: boolean) => Promise<boolean>
}
const overlays = new Set<DriverOverlay>()
export function useMobileDriverViewer(owner: DriverOverlay): void {
  const committed = useRef(owner)
  useEffect(() => {
    committed.current = owner
  })
  useEffect(() => {
    if (!owner.ptyId || !owner.visible) {
      return
    }
    const overlay: DriverOverlay = {
      ptyId: owner.ptyId,
      visible: true,
      current: () => committed.current.current(),
      read: () => committed.current.read(),
      collapse: (collapsed) => committed.current.collapse(collapsed),
      restore: (all) => committed.current.restore(all)
    }
    overlays.add(overlay)
    return () => {
      overlays.delete(overlay)
    }
  }, [owner.ptyId, owner.visible])
}
export async function applyMobileDriverViewerRequest(
  request: ConnectionsViewerRequest
): Promise<MobileDriverViewerResult> {
  const parsed = MobileDriverViewerParams.safeParse(request.command)
  if (!parsed.success) {
    throw new Error('invalid_connections_viewer_command')
  }
  const command = parsed.data
  const matches = [...overlays].filter((overlay) => overlay.ptyId === command.ptyId)
  if (matches.length > 1) {
    throw new Error('connections_viewer_ambiguous')
  }
  const owner = matches[0]
  if (!owner || !owner.current()) {
    throw new Error('connections_surface_unavailable')
  }
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  let applied = true
  switch (command.operation) {
    case 'mobile-driver.get':
      break
    case 'mobile-driver.collapse':
    case 'mobile-driver.expand':
      applied = owner.collapse(command.operation === 'mobile-driver.collapse')
      break
    case 'mobile-driver.restore':
    case 'mobile-driver.restore-all': {
      const all = command.operation === 'mobile-driver.restore-all'
      if (command.confirmTarget !== (all ? 'all-mobile-terminals' : command.ptyId)) {
        throw new Error('confirm_target_mismatch')
      }
      applied = await owner.restore(all)
      break
    }
  }
  let state = owner.read()
  const completed = () =>
    command.operation === 'mobile-driver.collapse'
      ? state.collapsed
      : command.operation === 'mobile-driver.expand'
        ? !state.collapsed
        : command.operation === 'mobile-driver.restore'
          ? !state.driving && !state.heldFit
          : command.operation === 'mobile-driver.restore-all'
            ? state.remainingCount === 0
            : true
  while (applied && !completed() && Date.now() < request.expiresAt) {
    await new Promise((resolve) => setTimeout(resolve, 10))
    state = owner.read()
  }
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  return { viewerId: command.viewerId, applied: applied && completed(), persisted: null, state }
}
