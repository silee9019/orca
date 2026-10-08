import { useEffect, useRef } from 'react'
import {
  NetworkProxyViewerParams,
  type NetworkProxyViewerResult,
  type NetworkProxyViewerState
} from '../../../shared/network-proxy-viewer'
import type { ConnectionsViewerRequest } from '../../../shared/connections-viewer'
export type ProxyCommitResult = {
  persisted: boolean
  current: () => boolean
  matches: () => boolean
}
type ProxyOwner = {
  read: () => NetworkProxyViewerState
  disclosure: (open: boolean) => void
  url: (value: string) => void
  bypass: (value: string) => void
  matches: (kind: 'url' | 'bypass', value: string) => boolean
  commit: (kind: 'url' | 'bypass') => Promise<ProxyCommitResult | null>
}
const sections = new Set<ProxyOwner>()
export function useNetworkProxyViewer(owner: ProxyOwner): void {
  const committed = useRef(owner)
  useEffect(() => {
    committed.current = owner
  })
  useEffect(() => {
    const section: ProxyOwner = {
      read: () => committed.current.read(),
      disclosure: (open) => committed.current.disclosure(open),
      url: (value) => committed.current.url(value),
      bypass: (value) => committed.current.bypass(value),
      matches: (kind, value) => committed.current.matches(kind, value),
      commit: (kind) => committed.current.commit(kind)
    }
    sections.add(section)
    return () => {
      sections.delete(section)
    }
  }, [])
}
export async function applyNetworkProxyViewerRequest(
  request: ConnectionsViewerRequest
): Promise<NetworkProxyViewerResult> {
  const parsed = NetworkProxyViewerParams.safeParse(request.command)
  if (!parsed.success) {
    throw new Error('invalid_connections_viewer_command')
  }
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  if (sections.size > 1) {
    throw new Error('connections_viewer_ambiguous')
  }
  const owner = sections.values().next().value
  if (!owner) {
    throw new Error('connections_surface_unavailable')
  }
  const command = parsed.data
  let matches = () => true
  let current = () => true
  let applied = true
  let persisted: boolean | null = null
  switch (command.operation) {
    case 'network-proxy.get':
      break
    case 'network-proxy.url-commit':
    case 'network-proxy.bypass-commit': {
      if (!owner.read().open) {
        throw new Error('connections_surface_unavailable')
      }
      const result = await owner.commit(
        command.operation === 'network-proxy.url-commit' ? 'url' : 'bypass'
      )
      applied = result?.persisted === true
      persisted = applied
      matches = result?.matches ?? (() => false)
      current = result?.current ?? (() => false)
      break
    }
    case 'network-proxy.disclosure':
      if (!command.open && owner.read().forcedOpen) {
        return { viewerId: command.viewerId, applied: false, persisted: null, state: owner.read() }
      }
      owner.disclosure(command.open)
      matches = () => owner.read().open === command.open
      break
    case 'network-proxy.url-draft':
    case 'network-proxy.bypass-draft': {
      if (!owner.read().open) {
        throw new Error('connections_surface_unavailable')
      }
      const kind = command.operation === 'network-proxy.url-draft' ? 'url' : 'bypass'
      if (kind === 'url') {
        owner.url(command.value)
      } else {
        owner.bypass(command.value)
      }
      matches = () => owner.matches(kind, command.value)
      break
    }
  }
  while (
    applied &&
    current() &&
    !matches() &&
    Date.now() < request.expiresAt &&
    sections.has(owner)
  ) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  if (Date.now() >= request.expiresAt || !sections.has(owner)) {
    throw new Error('request_expired')
  }
  return {
    viewerId: command.viewerId,
    applied: applied && current() && matches(),
    persisted: persisted === null ? null : applied && current() && matches(),
    state: owner.read()
  }
}
