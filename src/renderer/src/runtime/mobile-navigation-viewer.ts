import { useEffect, useRef } from 'react'
import {
  MobileNavigationViewerParams,
  type MobileNavigationViewerState,
  type MobileNavigationViewerResult
} from '../../../shared/mobile-navigation-viewer'
import type { ConnectionsViewerRequest } from '../../../shared/connections-viewer'
type NavigationOwner = {
  surface: 'settings' | 'sidebar'
  read: () => MobileNavigationViewerState
  visibility: (shown: boolean) => Promise<boolean>
  dismissBadge?: () => void
  openInstall?: (platform: 'ios' | 'android') => Promise<boolean>
  persisted: (kind: 'visibility' | 'badge', shown: boolean) => Promise<boolean>
}
const owners = new Set<NavigationOwner>()
export function useMobileNavigationViewer(owner: NavigationOwner): void {
  const hasBadge = Boolean(owner.dismissBadge)
  const hasInstall = Boolean(owner.openInstall)
  const committed = useRef(owner)
  useEffect(() => {
    committed.current = owner
  })
  useEffect(() => {
    const current: NavigationOwner = {
      surface: owner.surface,
      read: () => committed.current.read(),
      visibility: (shown) => committed.current.visibility(shown),
      dismissBadge: hasBadge ? () => committed.current.dismissBadge?.() : undefined,
      openInstall: hasInstall
        ? (platform) => committed.current.openInstall?.(platform) ?? Promise.resolve(false)
        : undefined,
      persisted: (kind, shown) => committed.current.persisted(kind, shown)
    }
    owners.add(current)
    return () => {
      owners.delete(current)
    }
  }, [owner.surface, hasBadge, hasInstall])
}
export async function applyMobileNavigationViewerRequest(
  request: ConnectionsViewerRequest
): Promise<MobileNavigationViewerResult> {
  const parsed = MobileNavigationViewerParams.safeParse(request.command)
  if (!parsed.success) {
    throw new Error('invalid_connections_viewer_command')
  }
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  const command = parsed.data
  const selected = [...owners].filter((owner) => owner.surface === command.surface)
  if (selected.length > 1) {
    throw new Error('connections_viewer_ambiguous')
  }
  const owner = selected[0]
  if (!owner) {
    throw new Error('connections_surface_unavailable')
  }
  let applied = true
  let persisted: boolean | null = null
  let matches = () => true
  switch (command.operation) {
    case 'mobile-navigation.get':
      break
    case 'mobile-navigation.visibility':
      applied = await owner.visibility(command.shown)
      persisted = await owner.persisted('visibility', command.shown).catch(() => false)
      matches = () => owner.read().showButton === command.shown
      break
    case 'mobile-navigation.dismiss-badge':
      if (!owner.dismissBadge) {
        throw new Error('connections_surface_unavailable')
      }
      owner.dismissBadge()
      persisted = await owner.persisted('badge', false).catch(() => false)
      matches = () => !owner.read().badgeVisible
      break
    case 'mobile-navigation.open-install':
      if (!owner.openInstall) {
        throw new Error('connections_surface_unavailable')
      }
      applied = await owner.openInstall(command.platform).catch(() => false)
      break
  }
  await new Promise((resolve) => setTimeout(resolve, 0))
  while (applied && !matches() && owners.has(owner) && Date.now() < request.expiresAt) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  if (!owners.has(owner) || Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  return {
    viewerId: command.viewerId,
    applied: applied && matches(),
    persisted,
    state: owner.read()
  }
}
