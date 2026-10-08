import { randomUUID } from 'node:crypto'
import type { KernelFrame } from '../shared/notebook-kernel-types'
import type { startNotebookKernel } from './notebook/notebook-kernel'
type Started = ReturnType<typeof startNotebookKernel>
type State =
  | 'pending'
  | 'ready'
  | 'missing-ipykernel'
  | 'failed'
  | 'stopping'
  | 'cancelled'
  | 'exited'
type Request = {
  id: string
  state: State
  controller: AbortController
  started: Started | null
  executing: boolean
  exited: boolean
  sequence: number
  dropped: number
  bytes: number
  frames: { sequence: number; frame: KernelFrame; bytes: number }[]
  expiresAt: number
  expiry: ReturnType<typeof setTimeout> | null
  startup: ReturnType<typeof setTimeout> | null
}
const IDLE_TTL = 15 * 60 * 1000
const FRAME_BYTES = 1024 * 1024
export class DesktopNotebookKernelController {
  private request: Request | null = null
  private active = false
  start(
    factory: (
      signal: AbortSignal,
      onFrame: (frame: KernelFrame) => void,
      onProtocolFailure: () => void
    ) => Promise<Started>
  ) {
    if (this.active) {
      throw new Error('desktop_notebook_kernel_busy')
    }
    this.dispose()
    const request: Request = {
      id: randomUUID(),
      state: 'pending',
      controller: new AbortController(),
      started: null,
      executing: false,
      exited: false,
      sequence: 0,
      dropped: 0,
      bytes: 0,
      frames: [],
      expiresAt: 0,
      expiry: null,
      startup: null
    }
    this.request = request
    this.active = true
    request.startup = setTimeout(() => {
      request.state = 'failed'
      this.stop(request)
    }, 60000)
    request.startup.unref()
    void Promise.resolve()
      .then(() =>
        factory(
          request.controller.signal,
          (frame) => this.accept(request, frame),
          () => {
            request.state = 'failed'
            this.stop(request)
          }
        )
      )
      .then((started) => {
        request.started = started
        void started.exited.then(() => {
          request.exited = true
          request.executing = false
          this.active = false
          if (!['failed', 'missing-ipykernel'].includes(request.state)) {
            request.state = 'exited'
          }
          this.clearStartup(request)
          this.arm(request)
        })
        if (request.controller.signal.aborted) {
          started.kernel.shutdown()
        }
        void started.ready
          .then((ready) => {
            this.clearStartup(request)
            if (request.controller.signal.aborted || request.exited) {
              return
            }
            request.state = ready.status
            if (ready.status !== 'ready') {
              this.stop(request)
            }
          })
          .catch(() => {
            request.state = 'failed'
            this.stop(request)
          })
      })
      .catch(() => {
        this.clearStartup(request)
        request.state =
          request.controller.signal.aborted && request.state !== 'failed' ? 'cancelled' : 'failed'
        this.active = false
        this.arm(request)
      })
    this.arm(request)
    return this.status(request.id)
  }
  status(id: string) {
    const request = this.get(id)
    return {
      requestId: id,
      state: request.state,
      executing: request.executing,
      executionVerdict: request.exited ? ('exited' as const) : ('unverifiable' as const),
      latestSequence: request.sequence,
      droppedFrames: request.dropped
    }
  }
  execute(id: string, code: string) {
    const request = this.get(id)
    if (request.state !== 'ready' || !request.started || request.executing) {
      throw new Error('Notebook kernel is unavailable or executing.')
    }
    request.executing = true
    try {
      request.started.kernel.execute(code)
    } catch {
      request.state = 'failed'
      this.stop(request)
      throw new Error('Notebook execution could not be submitted.')
    }
    return { requestId: id, accepted: true, executionVerdict: 'unverifiable' as const }
  }
  interrupt(id: string) {
    const request = this.get(id)
    if (request.state !== 'ready' || !request.started) {
      throw new Error('Notebook kernel is not ready.')
    }
    request.started.kernel.interrupt()
    return { requestId: id, requested: true, executionVerdict: 'unverifiable' as const }
  }
  shutdown(id: string) {
    const request = this.get(id)
    if (!request.exited) {
      request.state = 'stopping'
      this.stop(request)
    }
    return this.status(id)
  }
  frames(id: string, afterSequence: number, limit: number) {
    const request = this.get(id)
    const selected = request.frames.filter((item) => item.sequence > afterSequence).slice(0, limit)
    const nextSequence = selected.at(-1)?.sequence ?? Math.max(afterSequence, request.sequence)
    return {
      requestId: id,
      frames: selected.map(({ sequence, frame }) => ({ sequence, frame: structuredClone(frame) })),
      nextSequence,
      hasMore: request.frames.some((item) => item.sequence > nextSequence),
      droppedFrames: request.dropped,
      truncated:
        request.dropped > 0 &&
        afterSequence < (request.frames[0]?.sequence ?? request.sequence + 1) - 1
    }
  }
  dispose(): void {
    if (!this.request) {
      return
    }
    this.stop(this.request)
    if (this.request.expiry) {
      clearTimeout(this.request.expiry)
    }
    this.clearStartup(this.request)
    this.request.frames = []
    this.request = null
  }
  private get(id: string): Request {
    if (!this.request || this.request.id !== id) {
      throw new Error('selector_not_found')
    }
    if (Date.now() >= this.request.expiresAt) {
      if (this.active) {
        this.request.state = 'stopping'
        this.stop(this.request)
      } else {
        this.dispose()
        throw new Error('selector_not_found')
      }
    }
    this.arm(this.request)
    return this.request
  }
  private accept(request: Request, original: KernelFrame): void {
    if (request.controller.signal.aborted || this.request !== request) {
      return
    }
    if (original.type === 'done') {
      request.executing = false
    }
    const frame: KernelFrame = original.type === 'exit' ? { type: 'exit', detail: '' } : original
    const bytes = Buffer.byteLength(JSON.stringify(frame), 'utf8')
    request.sequence++
    if (bytes > FRAME_BYTES) {
      request.dropped++
      return
    }
    request.frames.push({ sequence: request.sequence, frame: structuredClone(frame), bytes })
    request.bytes += bytes
    while (request.frames.length > 500 || request.bytes > FRAME_BYTES) {
      const removed = request.frames.shift()
      if (removed) {
        request.bytes -= removed.bytes
        request.dropped++
      }
    }
  }
  private stop(request: Request): void {
    const already = request.controller.signal.aborted
    request.controller.abort()
    if (!already) {
      request.started?.kernel.shutdown()
    }
  }
  private arm(request: Request): void {
    if (this.request !== request) {
      return
    }
    if (request.expiry) {
      clearTimeout(request.expiry)
    }
    request.expiresAt = Date.now() + IDLE_TTL
    request.expiry = setTimeout(() => {
      if (this.request !== request) {
        return
      }
      if (this.active) {
        request.state = 'stopping'
        this.stop(request)
      } else {
        this.dispose()
      }
    }, IDLE_TTL)
    request.expiry.unref()
  }
  private clearStartup(request: Request): void {
    if (request.startup) {
      clearTimeout(request.startup)
      request.startup = null
    }
  }
}
