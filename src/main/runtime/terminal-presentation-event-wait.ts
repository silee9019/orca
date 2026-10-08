import type { OrcaRuntimeService } from './orca-runtime'
import type { DriverState } from './orca-runtime-core'

type PresentationEvent =
  | { kind: 'driver'; driver: DriverState }
  | {
      kind: 'fit'
      mode: 'mobile-fit' | 'remote-desktop-fit' | 'desktop-fit'
      cols: number
      rows: number
    }
export function waitForTerminalPresentationEvent(
  runtime: OrcaRuntimeService,
  ptyId: string,
  kind: 'driver' | 'fit',
  timeoutMs: number,
  signal: AbortSignal | undefined,
  assertOwner: () => void
): Promise<{ observed: boolean; timedOut: boolean; event: PresentationEvent | null }> {
  return new Promise((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const subscriptions: (() => void)[] = []
    const cleanup = () => {
      if (timer) {
        clearTimeout(timer)
      }
      signal?.removeEventListener('abort', aborted)
      for (const unsubscribe of subscriptions.splice(0)) {
        unsubscribe()
      }
    }
    const fail = (error: unknown) => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      reject(error)
    }
    const finish = (event: PresentationEvent | null) => {
      if (settled) {
        return
      }
      try {
        assertOwner()
      } catch (error) {
        fail(error)
        return
      }
      settled = true
      cleanup()
      resolve({ observed: event !== null, timedOut: event === null, event })
    }
    function aborted() {
      fail(new Error('terminal_presentation_wait_cancelled'))
    }
    const register = (unsubscribe: () => void) => {
      if (settled) {
        unsubscribe()
      } else {
        subscriptions.push(unsubscribe)
      }
    }
    try {
      assertOwner()
      signal?.throwIfAborted()
      signal?.addEventListener('abort', aborted, { once: true })
      timer = setTimeout(() => finish(null), timeoutMs)
      register(
        kind === 'driver'
          ? runtime.subscribeToDriverChanges(ptyId, (driver) => finish({ kind: 'driver', driver }))
          : runtime.subscribeToFitOverrideChanges(ptyId, (event) =>
              finish({ kind: 'fit', ...event })
            )
      )
      register(runtime.subscribeToPtyExit(ptyId, () => fail(new Error('terminal_gone'))))
      if (signal?.aborted) {
        aborted()
      }
    } catch (error) {
      fail(error)
    }
  })
}
