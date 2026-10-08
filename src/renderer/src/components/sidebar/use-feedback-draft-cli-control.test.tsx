// @vitest-environment happy-dom
import { useRef, useState } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { AppSurfaceAction, AppSurfaceRequest } from '../../../../shared/app-surface-control'
import { registerAppSurfaceIpcBridge } from '../../hooks/ipc-events/app-surface-ipc-bridge'
import { useFeedbackDraftCliControl } from './use-feedback-draft-cli-control'
it('removes only the requested image and never publishes feedback text or bytes', async () => {
  let receive: ((request: AppSurfaceRequest) => void) | undefined
  const reply = vi.fn()
  window.orcaAppSurface = {
    onRequest: (callback) => {
      receive = callback
      return () => {}
    },
    reply
  }
  let busy = false
  const hook = renderHook(() => {
    const [images, setImages] = useState([
      { id: 'first', privateBytes: 'canary' },
      { id: 'second', privateBytes: 'canary' }
    ])
    const textarea = useRef<HTMLTextAreaElement>(null)
    useFeedbackDraftCliControl({
      open: true,
      busy,
      images,
      remove: (id) => setImages((current) => current.filter((image) => image.id !== id)),
      textarea
    })
    return images
  })
  const cleanup = registerAppSurfaceIpcBridge()
  async function send(action: AppSurfaceAction): Promise<void> {
    reply.mockClear()
    await act(async () => receive?.({ requestId: 'c8d153e4-ef16-4da8-b972-2fd3cecb378b', action }))
    await waitFor(() => expect(reply).toHaveBeenCalledOnce())
  }
  try {
    await send({ kind: 'feedback-draft', action: 'status' })
    expect(JSON.stringify(reply.mock.lastCall)).not.toContain('canary')
    busy = true
    hook.rerender()
    await send({ kind: 'feedback-draft', action: 'remove-image', imageId: 'first' })
    expect(reply.mock.lastCall?.[0]).toMatchObject({ ok: false })
    expect(hook.result.current).toHaveLength(2)
    busy = false
    hook.rerender()
    await send({ kind: 'feedback-draft', action: 'remove-image', imageId: 'first' })
    expect(hook.result.current.map((image) => image.id)).toEqual(['second'])
  } finally {
    hook.unmount()
    cleanup()
    delete window.orcaAppSurface
  }
})
