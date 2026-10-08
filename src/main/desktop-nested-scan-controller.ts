import { randomUUID } from 'node:crypto'
import type { NestedRepoScanResult } from '../shared/project-group-types'
type Progress = Pick<NestedRepoScanResult, 'truncated' | 'timedOut' | 'stopped' | 'durationMs'> & {
  repoCount: number
}
type Request = {
  requestId: string
  state: 'pending' | 'cancel_requested' | 'completed' | 'cancelled' | 'failed'
  controller: AbortController
  scan: NestedRepoScanResult | null
  progress: Progress | null
  settledAt: number | null
  expiry: ReturnType<typeof setTimeout> | null
}
const TTL = 15 * 60 * 1000
export class DesktopNestedScanController {
  private active = false
  private request: Request | null = null
  start(
    scan: (
      signal: AbortSignal,
      progress: (value: NestedRepoScanResult) => void
    ) => Promise<NestedRepoScanResult>
  ) {
    if (this.active) {
      throw new Error('desktop_nested_scan_busy')
    }
    this.dispose()
    const request: Request = {
      requestId: randomUUID(),
      state: 'pending',
      controller: new AbortController(),
      scan: null,
      progress: null,
      settledAt: null,
      expiry: null
    }
    this.request = request
    this.active = true
    void Promise.resolve()
      .then(() =>
        scan(request.controller.signal, (value) => {
          if (!request.controller.signal.aborted) {
            request.progress = {
              repoCount: value.repos.length,
              truncated: value.truncated,
              timedOut: value.timedOut,
              stopped: value.stopped,
              durationMs: value.durationMs
            }
          }
        })
      )
      .then((value) => {
        if (!request.controller.signal.aborted) {
          const { repos, ...summary } = value
          const retained: NestedRepoScanResult['repos'] = []
          let bytes = Buffer.byteLength(JSON.stringify(summary))
          for (const row of repos) {
            const size = Buffer.byteLength(JSON.stringify(row)) + 1
            if (retained.length >= 500 || bytes + size > 1024 * 1024) {
              break
            }
            retained.push({ path: row.path, displayName: row.displayName, depth: row.depth })
            bytes += size
          }
          request.scan = {
            ...summary,
            repos: retained,
            truncated: value.truncated || retained.length < repos.length
          }
          request.state = 'completed'
        }
      })
      .catch(() => {
        request.state = 'failed'
        request.scan = null
      })
      .finally(() => {
        if (request.controller.signal.aborted) {
          request.state = 'cancelled'
          request.scan = null
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
      progress: request.progress ? { ...request.progress } : null,
      executionVerdict: 'unverifiable' as const
    }
  }
  cancel(requestId: string) {
    const request = this.get(requestId)
    request.controller.abort()
    request.scan = null
    request.state = this.active ? 'cancel_requested' : 'cancelled'
    return this.status(requestId)
  }
  result(requestId: string, offset: number, limit: number) {
    const request = this.get(requestId)
    if (request.state !== 'completed' || !request.scan) {
      throw new Error('No completed CLI nested scan result.')
    }
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 500
    ) {
      throw new Error('Invalid nested scan result page.')
    }
    const { repos, ...summary } = request.scan
    return {
      requestId,
      summary,
      total: repos.length,
      offset,
      limit,
      repos: repos.slice(offset, offset + limit).map((row) => ({ ...row })),
      hasMore: offset + limit < repos.length
    }
  }
  dispose(): void {
    if (this.request) {
      this.request.controller.abort()
      if (this.request.expiry) {
        clearTimeout(this.request.expiry)
      }
      this.request.scan = null
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
