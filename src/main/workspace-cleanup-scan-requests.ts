import { randomUUID } from 'node:crypto'
import type {
  WorkspaceCleanupScanArgs,
  WorkspaceCleanupScanResult
} from '../shared/workspace-cleanup'
import type { WorkspaceCleanupScanOptions } from './ipc/workspace-cleanup-progress-emitter'
const RESULT_TTL_MS = 15 * 60 * 1000
type ScanState = 'pending' | 'cancel_requested' | 'completed' | 'cancelled' | 'failed'
type ScanRequest = {
  requestId: string
  state: ScanState
  controller: AbortController
  result: WorkspaceCleanupScanResult | null
  progress: { scannedWorktreeCount: number; totalWorktreeCount: number } | null
  settledAt: number | null
  expiry: ReturnType<typeof setTimeout> | null
}
export class WorkspaceCleanupScanRequests {
  private request: ScanRequest | null = null
  constructor(
    private readonly scan: (
      args: WorkspaceCleanupScanArgs,
      options: WorkspaceCleanupScanOptions
    ) => Promise<WorkspaceCleanupScanResult>
  ) {}
  start(args: WorkspaceCleanupScanArgs): { requestId: string; state: ScanState } {
    if (this.request?.state === 'pending' || this.request?.state === 'cancel_requested') {
      throw new Error('A CLI cleanup scan is already pending on this desktop.')
    }
    this.dispose()
    const request: ScanRequest = {
      requestId: randomUUID(),
      state: 'pending',
      controller: new AbortController(),
      result: null,
      progress: null,
      settledAt: null,
      expiry: null
    }
    this.request = request
    void Promise.resolve()
      .then(() =>
        this.scan(
          { ...args, scanId: request.requestId },
          {
            signal: request.controller.signal,
            onProgress: (progress) => {
              if (this.request === request) {
                request.progress = {
                  scannedWorktreeCount: progress.scannedWorktreeCount,
                  totalWorktreeCount: progress.totalWorktreeCount
                }
              }
            }
          }
        )
      )
      .then(
        (result) => this.finish(request, result, false),
        () => this.finish(request, null, true)
      )
    return { requestId: request.requestId, state: request.state }
  }
  status(requestId: string): {
    requestId: string
    state: ScanState
    progress: ScanRequest['progress']
  } {
    const request = this.get(requestId)
    return {
      requestId: request.requestId,
      state: request.state,
      progress: request.progress ? { ...request.progress } : null
    }
  }
  cancel(requestId: string): ReturnType<WorkspaceCleanupScanRequests['status']> {
    const request = this.get(requestId)
    request.controller.abort()
    request.result = null
    request.state =
      request.state === 'pending' || request.state === 'cancel_requested'
        ? 'cancel_requested'
        : 'cancelled'
    return this.status(requestId)
  }
  result(requestId: string): WorkspaceCleanupScanResult {
    const request = this.get(requestId)
    if (request.state !== 'completed' || !request.result) {
      throw new Error('The CLI cleanup scan has no completed result.')
    }
    return request.result
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
  private get(requestId: string): ScanRequest {
    const request = this.request
    if (request && request.settledAt !== null && Date.now() - request.settledAt >= RESULT_TTL_MS) {
      this.dispose()
    }
    if (!this.request || this.request.requestId !== requestId) {
      throw new Error('selector_not_found')
    }
    return this.request
  }
  private finish(
    request: ScanRequest,
    result: WorkspaceCleanupScanResult | null,
    failed: boolean
  ): void {
    if (this.request !== request) {
      return
    }
    request.state = request.controller.signal.aborted
      ? 'cancelled'
      : failed
        ? 'failed'
        : 'completed'
    request.result = request.state === 'completed' ? result : null
    request.settledAt = Date.now()
    request.expiry = setTimeout(() => {
      if (this.request === request) {
        this.dispose()
      }
    }, RESULT_TTL_MS)
    request.expiry.unref()
  }
}
