import { randomUUID } from 'node:crypto'
type State = 'pending' | 'cancel_requested' | 'completed' | 'cancelled' | 'failed'
type Request = {
  requestId: string
  state: State
  controller: AbortController
  files: string[]
  truncated: boolean
  expiry: ReturnType<typeof setTimeout> | null
  settledAt: number | null
}
const TTL = 15 * 60 * 1000
export class DesktopFileListController {
  private request: Request | null = null
  private active = false
  start(list: (signal: AbortSignal) => Promise<string[]>, maxResults: number) {
    if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 10000) {
      throw new Error('Invalid file listing limit.')
    }
    if (this.active) {
      throw new Error('desktop_file_list_busy')
    }
    this.dispose()
    const request: Request = {
      requestId: randomUUID(),
      state: 'pending',
      controller: new AbortController(),
      files: [],
      truncated: false,
      expiry: null,
      settledAt: null
    }
    this.request = request
    this.active = true
    void Promise.resolve()
      .then(() => list(request.controller.signal))
      .then(
        (files) => {
          if (!request.controller.signal.aborted) {
            let bytes = 0
            for (const file of files) {
              const size = Buffer.byteLength(JSON.stringify(file)) + 1
              if (request.files.length >= maxResults || bytes + size > 1024 * 1024) {
                request.truncated = true
                break
              }
              bytes += size
              request.files.push(file)
            }
            request.state = 'completed'
          }
        },
        () => {
          request.state = 'failed'
        }
      )
      .catch(() => {
        request.state = 'failed'
        request.files = []
      })
      .finally(() => {
        if (request.controller.signal.aborted) {
          request.state = 'cancelled'
          request.files = []
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
    return { requestId, state: request.state, executionVerdict: 'unverifiable' as const }
  }
  cancel(requestId: string) {
    const request = this.get(requestId)
    request.controller.abort()
    request.files = []
    request.state = this.active ? 'cancel_requested' : 'cancelled'
    return this.status(requestId)
  }
  result(requestId: string, offset: number, limit: number) {
    const request = this.get(requestId)
    if (request.state !== 'completed') {
      throw new Error('No completed CLI file listing result.')
    }
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 500
    ) {
      throw new Error('Invalid file listing result page.')
    }
    return {
      requestId,
      offset,
      limit,
      total: request.files.length,
      files: request.files.slice(offset, offset + limit),
      hasMore: offset + limit < request.files.length,
      truncated: request.truncated
    }
  }
  dispose(): void {
    if (this.request) {
      this.request.controller.abort()
      if (this.request.expiry) {
        clearTimeout(this.request.expiry)
      }
      this.request.files = []
      this.request = null
    }
  }
  private get(requestId: string): Request {
    if (
      this.request?.settledAt !== null &&
      this.request &&
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
