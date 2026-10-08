import type { HostStackRouteTarget } from '../navigation/host-stack-navigation'

export type MobileSessionRouteParams = {
  hostId: string
  worktreeId: string
  paneKey?: string
  name?: string
}

/** Identities stay raw — the navigator owns the params, so pre-encoding a
 *  workspace id would reach the session screen still escaped. */
export function mobileSessionRouteTarget({
  hostId,
  worktreeId,
  name,
  paneKey
}: MobileSessionRouteParams): HostStackRouteTarget {
  return {
    name: '[hostId]/session/[worktreeId]',
    params: { hostId, worktreeId, ...(name ? { name } : {}), ...(paneKey ? { paneKey } : {}) }
  }
}

/** The path a worktree row opens, shared by the host list and the session title dropdown. */
export function worktreeSessionPath(hostId: string, worktreeId: string, name: string): string {
  return `/h/${encodeURIComponent(hostId)}/session/${encodeURIComponent(worktreeId)}?name=${encodeURIComponent(name)}`
}
