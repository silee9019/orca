import { useEffect, useRef } from 'react'
import {
  RuntimeLinkViewerParams,
  type RuntimeLinkViewerResult,
  type RuntimeLinkViewerState
} from '../../../shared/runtime-link-viewer'
import type { ConnectionsViewerRequest } from '../../../shared/connections-viewer'
type RuntimeLinkOwner = {
  generate: (
    address: string,
    intent: 'another' | 'local' | 'custom'
  ) => Promise<(() => boolean) | null>
  matchesGeneration: (completion: () => boolean) => boolean
  copy: (target: 'web' | 'pairing') => Promise<(() => boolean) | null>
  revoke: (deviceId: string) => Promise<(() => boolean) | null>
  read: () => RuntimeLinkViewerState
  intent: (value: 'another' | 'local' | 'custom') => void
  address: (value: string) => boolean
  matchesAddress: (value: string) => boolean
  refresh: (target: 'network' | 'grants') => Promise<object | null>
  matchesRefresh: (target: 'network' | 'grants', result: object) => boolean
}
const owners = new Set<RuntimeLinkOwner>()
export function useRuntimeLinkViewer(owner: RuntimeLinkOwner): void {
  const committed = useRef(owner)
  useEffect(() => {
    committed.current = owner
  })
  useEffect(() => {
    const current: RuntimeLinkOwner = {
      read: () => committed.current.read(),
      generate: (address, intent) => committed.current.generate(address, intent),
      matchesGeneration: (completion) => committed.current.matchesGeneration(completion),
      copy: (target) => committed.current.copy(target),
      revoke: (deviceId) => committed.current.revoke(deviceId),
      intent: (value) => committed.current.intent(value),
      address: (value) => committed.current.address(value),
      matchesAddress: (value) => committed.current.matchesAddress(value),
      refresh: (target) => committed.current.refresh(target),
      matchesRefresh: (target, result) => committed.current.matchesRefresh(target, result)
    }
    owners.add(current)
    return () => {
      owners.delete(current)
    }
  }, [])
}
export async function applyRuntimeLinkViewerRequest(
  request: ConnectionsViewerRequest
): Promise<RuntimeLinkViewerResult> {
  const parsed = RuntimeLinkViewerParams.safeParse(request.command)
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
  let applied = true
  let matches = () => true
  switch (command.operation) {
    case 'runtime-link.get':
      break
    case 'runtime-link.generate':
    case 'runtime-link.copy':
    case 'runtime-link.revoke': {
      if (command.operation !== 'runtime-link.revoke' && !owner.read().formVisible) {
        throw new Error('connections_surface_unavailable')
      }
      const completion =
        command.operation === 'runtime-link.generate'
          ? await owner.generate(command.address, command.intent)
          : command.operation === 'runtime-link.copy'
            ? await owner.copy(command.target)
            : await owner.revoke(command.deviceId)
      applied = completion !== null
      matches = completion
        ? () =>
            completion() &&
            (command.operation === 'runtime-link.generate'
              ? owner.matchesGeneration(completion) && owner.read().current
              : command.operation === 'runtime-link.copy'
                ? owner.read().copiedTarget === command.target
                : !owner.read().grantsLoading)
        : () => true
      break
    }
    case 'runtime-link.intent':
      if (!owner.read().formVisible || owner.read().generating) {
        throw new Error('connections_surface_unavailable')
      }
      owner.intent(command.value)
      matches = () => owner.read().intent === command.value
      break
    case 'runtime-link.address':
      if (!owner.read().formVisible || owner.read().generating) {
        throw new Error('connections_surface_unavailable')
      }
      applied = owner.address(command.value)
      matches = () => !applied || owner.matchesAddress(command.value)
      break
    case 'runtime-link.refresh': {
      if (command.target === 'network' && !owner.read().formVisible) {
        throw new Error('connections_surface_unavailable')
      }
      const result = await owner.refresh(command.target)
      applied = result !== null
      matches = () => result === null || owner.matchesRefresh(command.target, result)
      break
    }
  }
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
