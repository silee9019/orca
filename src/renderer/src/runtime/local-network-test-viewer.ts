import { useEffect, useRef } from 'react'
import {
  LocalNetworkTestViewerParams,
  type LocalNetworkTestViewerResult,
  type LocalNetworkTestViewerState
} from '../../../shared/local-network-test-viewer'
import type { ConnectionsViewerRequest } from '../../../shared/connections-viewer'
export type LocalNetworkTestCompletion = {
  completed: boolean
  persisted: boolean | null
  matches: () => boolean
}
type TestOwner = {
  read: () => LocalNetworkTestViewerState
  disclosure: (open: boolean) => void
  host: (value: string) => boolean
  port: (value: string) => boolean
  matches: (kind: 'host' | 'port', value: string) => boolean
  target: (host: string, port: number) => boolean
  submit: () => Promise<LocalNetworkTestCompletion | null>
}
const tests = new Set<TestOwner>()
export function useLocalNetworkTestViewer(owner: TestOwner): void {
  const committed = useRef(owner)
  useEffect(() => {
    committed.current = owner
  })
  useEffect(() => {
    const test: TestOwner = {
      read: () => committed.current.read(),
      disclosure: (open) => committed.current.disclosure(open),
      host: (value) => committed.current.host(value),
      port: (value) => committed.current.port(value),
      matches: (kind, value) => committed.current.matches(kind, value),
      target: (host, port) => committed.current.target(host, port),
      submit: () => committed.current.submit()
    }
    tests.add(test)
    return () => {
      tests.delete(test)
    }
  }, [])
}
export async function applyLocalNetworkTestViewerRequest(
  request: ConnectionsViewerRequest
): Promise<LocalNetworkTestViewerResult> {
  const parsed = LocalNetworkTestViewerParams.safeParse(request.command)
  if (!parsed.success) {
    throw new Error('invalid_connections_viewer_command')
  }
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  if (tests.size > 1) {
    throw new Error('connections_viewer_ambiguous')
  }
  const owner = tests.values().next().value
  if (!owner) {
    throw new Error('connections_surface_unavailable')
  }
  const command = parsed.data
  let matches = () => true
  let applied = true
  let persisted: boolean | null = null
  switch (command.operation) {
    case 'local-network-test.get':
      break
    case 'local-network-test.disclosure':
      owner.disclosure(command.open)
      matches = () => owner.read().open === command.open
      break
    case 'local-network-test.host':
    case 'local-network-test.port': {
      if (!owner.read().open) {
        throw new Error('connections_surface_unavailable')
      }
      const kind = command.operation === 'local-network-test.host' ? 'host' : 'port'
      applied = kind === 'host' ? owner.host(command.value) : owner.port(command.value)
      matches = applied ? () => owner.matches(kind, command.value) : () => true
      break
    }
    case 'local-network-test.submit': {
      if (!owner.read().open || !owner.target(command.host, command.port)) {
        throw new Error('local_network_target_mismatch')
      }
      const result = await owner.submit()
      if (!result) {
        applied = false
        break
      }
      applied = result.completed
      persisted = result.persisted
      matches = result.matches
      break
    }
  }
  while (!matches() && Date.now() < request.expiresAt && tests.has(owner)) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  if (Date.now() >= request.expiresAt || !tests.has(owner)) {
    throw new Error('request_expired')
  }
  return {
    viewerId: command.viewerId,
    applied: applied && matches(),
    persisted,
    state: owner.read()
  }
}
