import { randomUUID } from 'node:crypto'
import type { RpcContext } from '../core'

const incarnation = randomUUID()

export function desktopAppTarget({ runtime }: RpcContext): string {
  return `${runtime.getRuntimeId()}:${process.pid}:${incarnation}`
}

export function assertDesktopAppContext(context: RpcContext): void {
  if (
    !process.versions.electron ||
    context.runtime.getStatus().desktopWindowStatus !== 'available'
  ) {
    throw Object.assign(
      new Error('This runtime has no desktop app. Address a desktop Orca runtime.'),
      { code: 'desktop_unavailable' }
    )
  }
  if (context.clientKind === 'mobile') {
    throw Object.assign(new Error('Desktop app control requires a runtime connection.'), {
      code: 'forbidden'
    })
  }
}

export function assertDesktopAppTarget(context: RpcContext, confirmTarget: string): void {
  assertDesktopAppContext(context)
  if (confirmTarget !== desktopAppTarget(context)) {
    throw Object.assign(
      new Error('App target changed. Read app status and confirm the current target.'),
      { code: 'target_mismatch' }
    )
  }
}
