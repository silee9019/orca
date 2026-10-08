import { afterEach, expect, it, vi } from 'vitest'
import type { KernelFrame, KernelStartResult } from '../shared/notebook-kernel-types'
import type { startNotebookKernel } from './notebook/notebook-kernel'
import { DesktopNotebookKernelController } from './desktop-notebook-kernel-controller'
function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function bridge() {
  const ready = deferred<KernelStartResult>()
  const exited = deferred<void>()
  const kernel = { execute: vi.fn(), interrupt: vi.fn(), shutdown: vi.fn() }
  const started: ReturnType<typeof startNotebookKernel> = {
    kernel,
    ready: ready.promise,
    exited: exited.promise
  }
  return { ready, exited, kernel, started }
}
let controller: DesktopNotebookKernelController | undefined
afterEach(() => {
  controller?.dispose()
  vi.useRealTimers()
})
it('keeps shutdown separate from exit and refuses late readiness and concurrent starts', async () => {
  controller = new DesktopNotebookKernelController()
  const handle = bridge()
  let entered = false
  const request = controller.start(async () => {
    entered = true
    return handle.started
  })
  await vi.waitFor(() => expect(entered).toBe(true))
  expect(controller.shutdown(request.requestId)).toMatchObject({
    state: 'stopping',
    executionVerdict: 'unverifiable'
  })
  expect(handle.kernel.shutdown).toHaveBeenCalledOnce()
  expect(() => controller?.start(async () => bridge().started)).toThrow(
    'desktop_notebook_kernel_busy'
  )
  handle.ready.resolve({ status: 'ready' })
  await Promise.resolve()
  expect(controller.status(request.requestId).state).toBe('stopping')
  handle.exited.resolve()
  await vi.waitFor(() =>
    expect(controller?.status(request.requestId)).toMatchObject({
      state: 'exited',
      executionVerdict: 'exited'
    })
  )
  expect(() => controller?.execute(request.requestId, 'private code')).toThrow()
  controller.start(async () => bridge().started)
  expect(() => controller?.status(request.requestId)).toThrow('selector_not_found')
})
it('serializes executions until original done and bounds retained frames with explicit cursor loss', async () => {
  controller = new DesktopNotebookKernelController()
  const handle = bridge()
  let accept: (frame: KernelFrame) => void = () => {}
  const request = controller.start(async (_signal, onFrame) => {
    accept = onFrame
    return handle.started
  })
  handle.ready.resolve({ status: 'ready' })
  await vi.waitFor(() => expect(controller?.status(request.requestId).state).toBe('ready'))
  expect(controller.execute(request.requestId, 'private code')).toMatchObject({ accepted: true })
  expect(() => controller?.execute(request.requestId, 'second')).toThrow()
  controller.interrupt(request.requestId)
  expect(handle.kernel.interrupt).toHaveBeenCalledOnce()
  expect(JSON.stringify(controller.status(request.requestId))).not.toContain('private code')
  accept({ type: 'done', status: 'ok', execution_count: 1 })
  expect(controller.execute(request.requestId, 'second').accepted).toBe(true)
  const output: KernelFrame = { type: 'stream', content: { text: 'retained' } }
  for (let index = 0; index < 501; index++) {
    accept(output)
  }
  output.content.text = 'changed'
  const page = controller.frames(request.requestId, 0, 100)
  expect(page).toMatchObject({ truncated: true, hasMore: true, droppedFrames: 2 })
  expect(page.frames).toHaveLength(100)
  expect(page.frames[0].frame).toMatchObject({ content: { text: 'retained' } })
  accept({ type: 'stream', content: { text: 'x'.repeat(1024 * 1024) } })
  expect(controller.status(request.requestId).droppedFrames).toBe(3)
  accept({ type: 'exit', detail: 'private stderr' })
  expect(JSON.stringify(controller.frames(request.requestId, 0, 100))).not.toContain(
    'private stderr'
  )
})
it('applies startup and idle deadlines while retaining the slot until the original exit promise', async () => {
  vi.useFakeTimers()
  controller = new DesktopNotebookKernelController()
  const handle = bridge()
  const request = controller.start(async () => handle.started)
  await vi.advanceTimersByTimeAsync(60000)
  expect(controller.status(request.requestId).state).toBe('failed')
  expect(handle.kernel.shutdown).toHaveBeenCalledOnce()
  handle.exited.resolve()
  await vi.advanceTimersByTimeAsync(0)
  expect(controller.status(request.requestId).executionVerdict).toBe('exited')
  await vi.advanceTimersByTimeAsync(15 * 60 * 1000)
  expect(() => controller?.status(request.requestId)).toThrow('selector_not_found')
})
it('shuts down damaged protocol and discards raw readiness and stderr errors', async () => {
  controller = new DesktopNotebookKernelController()
  const handle = bridge()
  let damage: () => void = () => {}
  const request = controller.start(async (_signal, _frame, onFailure) => {
    damage = onFailure
    return handle.started
  })
  handle.ready.resolve({ status: 'ready' })
  await vi.waitFor(() => expect(controller?.status(request.requestId).state).toBe('ready'))
  damage()
  expect(controller.status(request.requestId).state).toBe('failed')
  expect(handle.kernel.shutdown).toHaveBeenCalledOnce()
  handle.exited.resolve()
  await Promise.resolve()
  expect(() => controller?.frames('foreign', 0, 100)).toThrow('selector_not_found')
})
