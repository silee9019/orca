import { useEffect } from 'react'
import type { z } from 'zod'
import { NativeContextViewerTarget } from '../../../shared/rpc-contract/usage-params'
import { useAcknowledgedViewerToggle } from './use-acknowledged-viewer-toggle'

type Target = z.infer<typeof NativeContextViewerTarget>
type Change = (open: boolean) => Promise<{ open: boolean }>
const contextCards = new Map<string, Set<Change>>()
const targetKey = (target: Target) => `${target.kind}:${target.id}`

export function useNativeContextViewerController(
  target: Target | undefined,
  open: boolean,
  change: (next: boolean) => void
): void {
  const key = target && targetKey(target)
  const request = useAcknowledgedViewerToggle(open, change, key)
  useEffect(() => {
    if (!key) {
      return
    }
    const controllers = contextCards.get(key) ?? new Set<Change>()
    controllers.add(request)
    contextCards.set(key, controllers)
    return () => {
      controllers.delete(request)
      if (controllers.size === 0) {
        contextCards.delete(key)
      }
    }
  }, [key, request])
}

export async function setNativeContextViewerOpen(target: Target, open: boolean) {
  const parsed = NativeContextViewerTarget.parse(target)
  const controllers = contextCards.get(targetKey(parsed))
  if (!controllers?.size) {
    throw new Error('native_context_viewer_unavailable')
  }
  if (controllers.size !== 1) {
    throw new Error('native_context_viewer_ambiguous')
  }
  const controller = controllers.values().next().value
  if (!controller) {
    throw new Error('native_context_viewer_unavailable')
  }
  return { target: parsed, ...(await controller(open)) }
}
