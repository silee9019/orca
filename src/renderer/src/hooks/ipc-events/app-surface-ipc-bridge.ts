import { useLayoutEffect } from 'react'
import {
  AppSurfaceRequest,
  type AppSurfaceAction,
  type AppSurfaceApi
} from '../../../../shared/app-surface-control'

declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- Window augmentation requires declaration merging.
  interface Window {
    orcaAppSurface?: AppSurfaceApi
  }
}
const eventName = 'orca:app-surface-control'
type SurfaceEvent = CustomEvent<{ action: AppSurfaceAction; run?: Promise<unknown> }>

export function useAppSurfaceControl(
  kind: AppSurfaceAction['kind'],
  handle: (action: AppSurfaceAction) => unknown
): void {
  useLayoutEffect(() => {
    const listener = (event: Event): void => {
      if (!(event instanceof CustomEvent)) {
        return
      }
      const parsed = AppSurfaceRequest.shape.action.safeParse(event.detail?.action)
      if (!parsed.success || parsed.data.kind !== kind || event.detail.run) {
        return
      }
      event.detail.run = Promise.resolve().then(() => handle(parsed.data))
    }
    window.addEventListener(eventName, listener)
    return () => window.removeEventListener(eventName, listener)
  }, [kind, handle])
}

export function registerAppSurfaceIpcBridge(): () => void {
  return (
    window.orcaAppSurface?.onRequest((request) => {
      const event: SurfaceEvent = new CustomEvent(eventName, { detail: { action: request.action } })
      window.dispatchEvent(event)
      const run =
        event.detail.run ??
        Promise.reject(new Error('The requested app surface is not mounted in this viewer'))
      void run.then(
        (result) =>
          window.orcaAppSurface?.reply({ requestId: request.requestId, ok: true, result }),
        (error) =>
          window.orcaAppSurface?.reply({
            requestId: request.requestId,
            ok: false,
            error: error instanceof Error ? error.message : 'Surface action failed'
          })
      )
    }) ?? (() => {})
  )
}
