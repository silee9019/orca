import { useEffect, useRef } from 'react'
import {
  mountSshWorkspaceOverlayViewerController,
  type SshWorkspaceOverlayViewerController,
  mountSshWorkspaceRemovalViewerController,
  type SshWorkspaceRemovalViewerController,
  mountSshHostRemovalViewerController,
  type SshHostRemovalViewerController,
  mountSshConfirmationViewerController,
  type SshConfirmationViewerController
} from '@/runtime/ssh-confirmation-viewer-controller'
export function useSshConfirmationViewerController(
  controller: SshConfirmationViewerController
): void {
  const committed = useRef(controller)
  useEffect(() => {
    committed.current = controller
  })
  useEffect(
    () =>
      mountSshConfirmationViewerController({
        read: () => committed.current.read(),
        request: (kind, id) => committed.current.request(kind, id),
        confirm: (kind) => committed.current.confirm(kind),
        cancel: (kind) => committed.current.cancel(kind)
      }),
    []
  )
}

export function useSshHostRemovalViewerController(
  controller: SshHostRemovalViewerController,
  enabled: boolean
): void {
  const committed = useRef(controller)
  useEffect(() => {
    committed.current = controller
  })
  useEffect(
    () =>
      enabled
        ? mountSshHostRemovalViewerController({
            targetId: controller.targetId,
            read: () => committed.current.read(),
            configure: (advanced, remove) => committed.current.configure(advanced, remove),
            confirm: (disposition) => committed.current.confirm(disposition),
            cancel: () => committed.current.cancel()
          })
        : undefined,
    [enabled, controller.targetId]
  )
}

export function useSshWorkspaceRemovalViewerController(
  controller: SshWorkspaceRemovalViewerController
): void {
  const committed = useRef(controller)
  useEffect(() => {
    committed.current = controller
  })
  useEffect(
    () =>
      mountSshWorkspaceRemovalViewerController({
        read: () => committed.current.read(),
        forget: () => committed.current.forget(),
        reconnectDelete: () => committed.current.reconnectDelete(),
        cancel: () => committed.current.cancel()
      }),
    []
  )
}

export function useSshWorkspaceOverlayViewerController(
  controller: SshWorkspaceOverlayViewerController,
  enabled = true
): void {
  const supportsSelect = controller.select !== undefined
  const supportsDisconnect = controller.disconnect !== undefined
  const committed = useRef(controller)
  useEffect(() => {
    committed.current = controller
  })
  useEffect(
    () =>
      enabled
        ? mountSshWorkspaceOverlayViewerController({
            read: () => committed.current.read(),
            connect: () => committed.current.connect(),
            request: () => committed.current.request?.() ?? false,
            ...(supportsSelect ? { select: () => committed.current.select?.() ?? false } : {}),
            ...(supportsDisconnect
              ? { disconnect: () => committed.current.disconnect?.() ?? Promise.resolve(false) }
              : {}),
            readRequestedConfirmation: () => committed.current.readRequestedConfirmation?.() ?? null
          })
        : undefined,
    [enabled, supportsDisconnect, supportsSelect]
  )
}
