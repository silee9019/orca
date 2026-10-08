import { randomUUID } from 'node:crypto'
export type DesktopRemoteCloneReceipt = {
  repoId: string
  path: string
  executionHostId: string
  kind: 'git'
}
type Request = {
  requestId: string
  state: 'pending' | 'cancel_requested' | 'completed' | 'cancelled' | 'failed'
  controller: AbortController
  percent: number | null
  receipt: DesktopRemoteCloneReceipt | null
  settledAt: number | null
  expiry: ReturnType<typeof setTimeout> | null
}
const TTL = 15 * 60 * 1000
export class DesktopRemoteCloneController {
  private active = false
  private request: Request | null = null
  start(
    clone: (
      controller: AbortController,
      onProgress: (progress: { phase: string; percent: number }) => void
    ) => Promise<DesktopRemoteCloneReceipt>
  ) {
    if (this.active) {
      throw new Error('desktop_remote_clone_busy')
    }
    this.dispose()
    const request: Request = {
      requestId: randomUUID(),
      state: 'pending',
      controller: new AbortController(),
      percent: null,
      receipt: null,
      settledAt: null,
      expiry: null
    }
    this.request = request
    this.active = true
    void Promise.resolve()
      .then(() =>
        clone(request.controller, (progress) => {
          if (
            request.state === 'pending' &&
            !request.controller.signal.aborted &&
            Number.isFinite(progress.percent) &&
            progress.percent >= 0 &&
            progress.percent <= 100
          ) {
            request.percent = Math.floor(progress.percent)
          }
        })
      )
      .then((receipt) => {
        if (!request.controller.signal.aborted) {
          request.receipt = { ...receipt }
          request.state = 'completed'
        }
      })
      .catch(() => {
        request.state = 'failed'
        request.receipt = null
      })
      .finally(() => {
        if (request.controller.signal.aborted) {
          request.state = 'cancelled'
          request.receipt = null
        }
        this.active = false
        request.settledAt = Date.now()
        if (this.request !== request) {
          return
        }
        request.expiry = setTimeout(() => {
          if (this.request === request) {
            this.dispose()
          }
        }, TTL)
        request.expiry.unref()
      })
    return this.status(request.requestId)
  }
  status(requestId: string) {
    const request = this.get(requestId)
    return {
      requestId,
      state: request.state,
      percent: request.percent,
      executionVerdict: 'unverifiable' as const
    }
  }
  cancel(requestId: string) {
    const request = this.get(requestId)
    request.controller.abort()
    request.receipt = null
    request.state = this.active ? 'cancel_requested' : 'cancelled'
    return this.status(requestId)
  }
  result(requestId: string) {
    const request = this.get(requestId)
    if (request.state !== 'completed' || !request.receipt) {
      throw new Error('No completed CLI remote clone result.')
    }
    return { requestId, ...request.receipt }
  }
  dispose(): void {
    if (this.request) {
      this.request.controller.abort()
      if (this.request.expiry) {
        clearTimeout(this.request.expiry)
      }
      this.request.receipt = null
      this.request = null
    }
  }
  private get(requestId: string): Request {
    if (
      this.request &&
      this.request.settledAt !== null &&
      Date.now() - this.request.settledAt >= TTL
    ) {
      this.dispose()
    }
    if (!this.request || this.request.requestId !== requestId) {
      throw new Error('selector_not_found')
    }
    return this.request
  }
}
