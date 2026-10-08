import { randomUUID } from 'node:crypto'
import type {
  WorkspaceSpaceAnalysis,
  WorkspaceSpaceAnalyzeResult,
  WorkspaceSpaceScanProgress
} from '../shared/workspace-space-types'
import type { WorkspaceSpaceAnalyzeOptions } from './workspace-space-repo-scan'
import { WorkspaceSpaceScanCancelledError } from './workspace-space-analysis'
const RESULT_TTL_MS = 15 * 60 * 1000
type ScanState = 'pending' | 'cancel_requested' | 'completed' | 'cancelled' | 'failed'
type ActiveScan = {
  owner: 'renderer' | 'cli'
  controller: AbortController
  promise: Promise<WorkspaceSpaceAnalyzeResult> | null
}
type CliRequest = {
  requestId: string
  state: ScanState
  controller: AbortController
  analysis: WorkspaceSpaceAnalysis | null
  progress: Pick<
    WorkspaceSpaceScanProgress,
    'totalRepoCount' | 'scannedRepoCount' | 'totalWorktreeCount' | 'scannedWorktreeCount'
  > | null
  settledAt: number | null
  expiry: ReturnType<typeof setTimeout> | null
}
export class WorkspaceSpaceScanController {
  private active: ActiveScan | null = null
  private request: CliRequest | null = null
  constructor(
    private readonly analyze: (
      options: WorkspaceSpaceAnalyzeOptions
    ) => Promise<WorkspaceSpaceAnalysis>,
    private readonly persist: (analysis: WorkspaceSpaceAnalysis) => void
  ) {}
  analyzeForRenderer(
    onProgress: (progress: WorkspaceSpaceScanProgress) => void
  ): Promise<WorkspaceSpaceAnalyzeResult> {
    if (this.active) {
      if (this.active.owner !== 'renderer' || !this.active.promise) {
        throw new Error('workspace_space_scan_busy')
      }
      return this.active.promise
    }
    return this.begin('renderer', randomUUID(), new AbortController(), onProgress)
  }
  cancelForRenderer(): boolean {
    if (!this.active || this.active.owner !== 'renderer' || this.active.controller.signal.aborted) {
      return false
    }
    this.active.controller.abort()
    return true
  }
  startCli(): { requestId: string; state: ScanState } {
    if (this.active) {
      throw new Error('workspace_space_scan_busy')
    }
    this.disposeCli()
    const request: CliRequest = {
      requestId: randomUUID(),
      state: 'pending',
      controller: new AbortController(),
      analysis: null,
      progress: null,
      settledAt: null,
      expiry: null
    }
    this.request = request
    let promise: Promise<WorkspaceSpaceAnalyzeResult>
    try {
      promise = this.begin('cli', request.requestId, request.controller, (progress) => {
        if (this.request === request) {
          request.progress = {
            totalRepoCount: progress.totalRepoCount,
            scannedRepoCount: progress.scannedRepoCount,
            totalWorktreeCount: progress.totalWorktreeCount,
            scannedWorktreeCount: progress.scannedWorktreeCount
          }
        }
      })
    } catch (error) {
      this.finish(request, null)
      throw error
    }
    void promise.then(
      (result) => this.finish(request, result),
      () => this.finish(request, null)
    )
    return { requestId: request.requestId, state: request.state }
  }
  status(requestId: string) {
    const request = this.get(requestId)
    return {
      requestId,
      state: request.state,
      progress: request.progress ? { ...request.progress } : null
    }
  }
  cancelCli(requestId: string): ReturnType<WorkspaceSpaceScanController['status']> {
    const request = this.get(requestId)
    request.controller.abort()
    request.analysis = null
    request.state =
      request.state === 'pending' || request.state === 'cancel_requested'
        ? 'cancel_requested'
        : 'cancelled'
    return this.status(requestId)
  }
  result(requestId: string, repoOffset: number, worktreeOffset: number, limit: number) {
    const request = this.get(requestId)
    if (request.state !== 'completed' || !request.analysis) {
      throw new Error('The CLI space scan has no completed result.')
    }
    if (
      ![repoOffset, worktreeOffset, limit].every(Number.isInteger) ||
      repoOffset < 0 ||
      worktreeOffset < 0 ||
      limit < 1 ||
      limit > 500
    ) {
      throw new Error('Invalid space scan result page.')
    }
    const { repos, worktrees, ...summary } = request.analysis
    return {
      summary,
      repoTotal: repos.length,
      worktreeTotal: worktrees.length,
      repoOffset,
      worktreeOffset,
      limit,
      repos: repos
        .slice(repoOffset, repoOffset + limit)
        .map((repo) => ({
          ...repo,
          error: repo.error === null ? null : 'Selected host analysis unavailable.'
        })),
      worktrees: worktrees
        .slice(worktreeOffset, worktreeOffset + limit)
        .map(({ topLevelItems, ...row }) => ({
          ...row,
          error: row.error === null ? null : 'Selected host analysis unavailable.',
          topLevelItemCount: topLevelItems.length
        })),
      hasMoreRepos: repoOffset + limit < repos.length,
      hasMoreWorktrees: worktreeOffset + limit < worktrees.length
    }
  }
  disposeCli(): void {
    if (this.request) {
      this.request.controller.abort()
      if (this.request.expiry) {
        clearTimeout(this.request.expiry)
      }
      this.request.analysis = null
      this.request = null
    }
  }
  private get(requestId: string): CliRequest {
    const request = this.request
    if (request && request.settledAt !== null && Date.now() - request.settledAt >= RESULT_TTL_MS) {
      this.disposeCli()
    }
    if (!this.request || this.request.requestId !== requestId) {
      throw new Error('selector_not_found')
    }
    return this.request
  }
  private begin(
    owner: ActiveScan['owner'],
    scanId: string,
    controller: AbortController,
    onProgress: (progress: WorkspaceSpaceScanProgress) => void
  ): Promise<WorkspaceSpaceAnalyzeResult> {
    const active: ActiveScan = { owner, controller, promise: null }
    this.active = active
    let analysis: Promise<WorkspaceSpaceAnalysis>
    try {
      analysis = this.analyze({ scanId, signal: controller.signal, onProgress })
    } catch (error) {
      this.active = null
      throw error
    }
    active.promise = analysis
      .then((value): WorkspaceSpaceAnalyzeResult => {
        if (controller.signal.aborted) {
          return { ok: false, cancelled: true }
        }
        this.persist(value)
        return { ok: true, analysis: value }
      })
      .catch((error: unknown): WorkspaceSpaceAnalyzeResult => {
        if (error instanceof WorkspaceSpaceScanCancelledError) {
          return { ok: false, cancelled: true }
        }
        throw error
      })
      .finally(() => {
        if (this.active === active) {
          this.active = null
        }
      })
    return active.promise
  }
  private finish(request: CliRequest, result: WorkspaceSpaceAnalyzeResult | null): void {
    if (this.request !== request) {
      return
    }
    request.state =
      request.controller.signal.aborted || (result !== null && !result.ok)
        ? 'cancelled'
        : result?.ok
          ? 'completed'
          : 'failed'
    request.analysis = request.state === 'completed' && result?.ok ? result.analysis : null
    request.settledAt = Date.now()
    request.expiry = setTimeout(() => {
      if (this.request === request) {
        this.disposeCli()
      }
    }, RESULT_TTL_MS)
    request.expiry.unref()
  }
}
