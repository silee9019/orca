import { randomUUID } from 'node:crypto'
import type { SearchResult } from '../shared/code-search-types'
import { DEFAULT_SEARCH_MAX_RESULTS } from '../shared/text-search'
type State = 'pending' | 'cancel_requested' | 'completed' | 'cancelled' | 'failed'
type Request = {
  requestId: string
  state: State
  controller: AbortController
  result: SearchResult | null
  sourceTotalMatches: number
  expiry: ReturnType<typeof setTimeout> | null
  settledAt: number | null
}
const TTL = 15 * 60 * 1000
export class DesktopFileSearchController {
  private request: Request | null = null
  private active = false
  start(list: (signal: AbortSignal) => Promise<SearchResult>, maxResults: number) {
    if (
      !Number.isInteger(maxResults) ||
      maxResults < 1 ||
      maxResults > DEFAULT_SEARCH_MAX_RESULTS
    ) {
      throw new Error('Invalid file search limit.')
    }
    if (this.active) {
      throw new Error('desktop_file_search_busy')
    }
    this.dispose()
    const request: Request = {
      requestId: randomUUID(),
      state: 'pending',
      controller: new AbortController(),
      result: null,
      sourceTotalMatches: 0,
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
            const retained: SearchResult = {
              files: [],
              totalMatches: 0,
              truncated: files.truncated
            }
            let bytes = 128
            for (const file of files.files) {
              const header = {
                filePath: file.filePath,
                relativePath: file.relativePath,
                matches: []
              }
              const next: SearchResult['files'][number] = { ...header, matches: [] }
              bytes += Buffer.byteLength(JSON.stringify(header))
              for (const match of file.matches) {
                const size = Buffer.byteLength(JSON.stringify(match)) + 1
                if (retained.totalMatches >= maxResults || bytes + size > 1024 * 1024) {
                  retained.truncated = true
                  break
                }
                next.matches.push({ ...match })
                retained.totalMatches += 1
                bytes += size
              }
              if (next.matches.length > 0) {
                retained.files.push(next)
              }
              if (
                retained.totalMatches >= maxResults ||
                bytes > 1024 * 1024 ||
                next.matches.length < file.matches.length
              ) {
                retained.truncated ||= retained.totalMatches < files.totalMatches
                break
              }
            }
            request.result = retained
            request.sourceTotalMatches = files.totalMatches
            request.state = 'completed'
          }
        },
        () => {
          request.state = 'failed'
        }
      )
      .catch(() => {
        request.state = 'failed'
        request.result = null
      })
      .finally(() => {
        if (request.controller.signal.aborted) {
          request.state = 'cancelled'
          request.result = null
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
    request.result = null
    request.state = this.active ? 'cancel_requested' : 'cancelled'
    return this.status(requestId)
  }
  result(requestId: string, offset: number, limit: number) {
    const request = this.get(requestId)
    if (request.state !== 'completed' || !request.result) {
      throw new Error('No completed CLI file search result.')
    }
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 500
    ) {
      throw new Error('Invalid file search result page.')
    }
    const { files, totalMatches, truncated } = request.result
    return {
      requestId,
      offset,
      limit,
      totalFiles: files.length,
      totalMatches,
      sourceTotalMatches: request.sourceTotalMatches,
      truncated,
      files: files
        .slice(offset, offset + limit)
        .map((file) => ({ ...file, matches: file.matches.map((match) => ({ ...match })) })),
      hasMore: offset + limit < files.length
    }
  }

  dispose(): void {
    if (this.request) {
      this.request.controller.abort()
      if (this.request.expiry) {
        clearTimeout(this.request.expiry)
      }
      this.request.result = null
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
