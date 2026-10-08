import { useAcknowledgedViewerToggle } from './use-acknowledged-viewer-toggle'
import { useEffect, useRef } from 'react'
type Provider = 'cursor' | 'zcode'
type Controller = { refresh: () => Promise<void>; busy: () => boolean }
const cursor = new Set<Controller>()
const zcode = new Set<Controller>()
export function useUsageAccountRefreshController(
  provider: Provider,
  refresh: () => Promise<void>,
  busy: boolean
) {
  const confirmIdle = useAcknowledgedViewerToggle(busy, () => {}, provider)
  const current = useRef({ refresh, busy })
  current.current = { refresh, busy }
  useEffect(() => {
    const controller = {
      refresh: async () => {
        await current.current.refresh()
        await confirmIdle(false)
      },
      busy: () => current.current.busy
    }
    const controllers = provider === 'cursor' ? cursor : zcode
    controllers.add(controller)
    return () => {
      controllers.delete(controller)
    }
  }, [provider, confirmIdle])
}
export async function refreshMountedUsageAccount(provider: Provider) {
  const controllers = provider === 'cursor' ? cursor : zcode
  if (controllers.size > 1) {
    throw new Error('usage_account_refresh_ambiguous')
  }
  const controller = [...controllers][0]
  if (!controller) {
    throw new Error('usage_account_refresh_unavailable')
  }
  if (controller.busy()) {
    throw new Error('usage_account_refresh_busy')
  }
  try {
    await controller.refresh()
  } catch {
    if (!controllers.has(controller)) {
      throw new Error('usage_account_refresh_unavailable')
    }
    throw new Error('usage_account_refresh_failed')
  }
  if (!controllers.has(controller)) {
    throw new Error('usage_account_refresh_unavailable')
  }
  return { provider, refreshCompleted: true }
}
