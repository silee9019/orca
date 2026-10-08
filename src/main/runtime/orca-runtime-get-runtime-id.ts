// @ts-nocheck -- mechanically split from OrcaRuntimeService; behavior is covered by AST equivalence and characterization tests.
import { replaceWorkspaceSessionState, patchWorkspaceSessionState } from './workspace-session-write'
import { OrcaRuntimeWithHasExactPersistedTerminalSurfaceIdentity } from './orca-runtime-has-exact-persisted-terminal-surface-identity'
import type {
  OrchestrationEnvironmentCallOptions,
  OrchestrationWorkerServer
} from './orchestration/environment-transport'
import type { RuntimeOrchestrationEnvelope } from '../../shared/runtime-rpc-envelope'
import type {
  RendererPtyStopOptions,
  RendererPtyStopReceipt
} from '../ipc/pty/runtime/renderer-pty-stop'
import type { ExecutionHostId } from '../../shared/execution-host'
import {
  LOCAL_EXECUTION_HOST_ID,
  getRepoExecutionHostId,
  parseExecutionHostId,
  toSshExecutionHostId
} from '../../shared/execution-host'
import type { PersistedState } from '../../shared/persisted-state-types'
import type { RuntimeTerminalSummary } from '../../shared/runtime-types'
import type { PtyListedSession, PtySessionListScope } from '../../shared/pty-listed-session'
import type { ResolvedWorktree } from './runtime-worktree-path-identity'
import {
  applyWorkspaceGitHubCache,
  type WorkspaceGitHubCacheSnapshot
} from './workspace-github-cache-write'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../shared/constants'
import type { CodexPaneSharedServerCommands } from '../codex/codex-pane-shared-server-commands'
import type { WorkspaceSessionState } from '../../shared/workspace-session-state-types'
import { publishConnectedRemoteWorkspaceTargets } from './remote-workspace-publish'

import { createWorkspaceIssueCommandRunner } from './runtime-issue-command-runner'
import { getLocalProjectWorktreeGitOptions } from '../project-runtime-git-options'
import { resolveSetupRunnerShell } from '../worktree-runner-script'
import type { WorktreeSetupLaunch } from '../../shared/worktree/launch-types'

export class OrcaRuntimeWithGetRuntimeId extends OrcaRuntimeWithHasExactPersistedTerminalSurfaceIdentity {
  getCodexPaneSharedServerCommands(): CodexPaneSharedServerCommands | null {
    return this.ptyController?.codexSharedServer ?? null
  }

  getRuntimeId(): string {
    return this.runtimeId
  }

  getWorkspaceSessionHostIds(): ExecutionHostId[] {
    if (!this.store?.getWorkspaceSessionHostIds) {
      throw new Error('runtime_unavailable')
    }
    return this.store.getWorkspaceSessionHostIds()
  }

  resolveOrchestrationWorkerServer(selector: string): OrchestrationWorkerServer {
    return this.orchestrationFederation.resolveWorkerServer(selector)
  }

  callOrchestrationWorkerServer(
    selector: string,
    method: string,
    params: unknown,
    timeoutMs?: number,
    envelope?: RuntimeOrchestrationEnvelope,
    internal?: OrchestrationEnvironmentCallOptions
  ): Promise<unknown> {
    return this.orchestrationFederation.callWorkerServer(
      selector,
      method,
      params,
      timeoutMs,
      envelope,
      internal
    )
  }

  async createWorkspaceIssueCommandRunner(
    selector: string,
    command: string
  ): Promise<WorktreeSetupLaunch> {
    const store = this.requireStore()
    return createWorkspaceIssueCommandRunner(
      {
        resolveWorktree: (target) => this.resolveWorktreeSelector(target),
        getRepo: (repoId) => store.getRepo(repoId),
        getRuntimeOptions: (repo) => getLocalProjectWorktreeGitOptions(store, repo),
        getSetupShell: () => resolveSetupRunnerShell(store.getSettings())
      },
      selector,
      command
    )
  }

  patchWorkspaceSessionState(
    params: { hostId: string; expected: unknown; patch: unknown },
    signal?: AbortSignal
  ) {
    return patchWorkspaceSessionState(this.requireStore(), params, signal)
  }

  replaceWorkspaceSessionState(
    params: { hostId: string; expected: unknown; next: unknown },
    signal?: AbortSignal
  ) {
    return replaceWorkspaceSessionState(this.requireStore(), params, signal)
  }

  syncOrchestrationFederation(runId?: string): Promise<void> {
    return this.orchestrationFederation.sync(runId)
  }

  syncOrchestrationFederatedDispatch(dispatchId: string): Promise<void> {
    return this.orchestrationFederation.syncDispatch(dispatchId)
  }

  syncOrchestrationFederatedDispatchAfterCurrent(dispatchId: string): Promise<void> {
    return this.orchestrationFederation.syncDispatchAfterCurrent(dispatchId)
  }

  readWorkspaceSessionState(hostId?: string | null): WorkspaceSessionState {
    if (!this.store?.getWorkspaceSession) {
      throw new Error('workspace_session_store_unavailable')
    }
    return this.store.getWorkspaceSession(hostId)
  }

  async flushWorkspaceSessionState(signal?: AbortSignal): Promise<void> {
    if (!this.store?.flushPendingOrThrowAsync) {
      throw new Error('workspace_session_flush_unavailable')
    }
    await this.store.flushPendingOrThrowAsync({ signal })
  }

  ensureOrchestrationFederationRelay(runId?: string): void {
    this.orchestrationFederation.ensureRelay(runId)
  }

  stopOrchestrationFederationRelay(): void {
    this.orchestrationFederation.stopRelay()
  }

  readSavedTerminalScrollback(ref: string): string | null {
    if (!this.store?.readTerminalScrollbackSnapshot) {
      throw new Error('runtime_unavailable')
    }
    return this.store.readTerminalScrollbackSnapshot(ref)
  }

  publishRemoteWorkspaceTargets(
    params: Parameters<typeof publishConnectedRemoteWorkspaceTargets>[1]
  ) {
    return publishConnectedRemoteWorkspaceTargets(this.requireStore(), params)
  }

  getStartedAt(): number {
    return this.startedAt
  }

  async stopRendererOwnedTerminalPty(
    ptyId: string,
    options: RendererPtyStopOptions,
    assertOwner: () => void
  ): Promise<RendererPtyStopReceipt> {
    if (!this.ptyController?.stopRendererOwnedPty) {
      throw new Error('renderer_pty_stop_unavailable')
    }
    return this.ptyController.stopRendererOwnedPty(ptyId, options, assertOwner)
  }

  protected tryGetWorkspaceSessionHostIdForWorktree(worktreeId: string): ExecutionHostId | null {
    return this.workspaceSessions.tryGetHostId(worktreeId)
  }

  protected listKnownExecutionHostIds(
    additionalHostIds: Iterable<ExecutionHostId> = [],
    includeConfiguredHosts = true
  ): Set<ExecutionHostId> {
    const hostIds = new Set<ExecutionHostId>([LOCAL_EXECUTION_HOST_ID])
    for (const hostId of this.store?.getWorkspaceSessionHostIds?.() ?? []) {
      hostIds.add(hostId)
    }
    for (const hostId of additionalHostIds) {
      if (!/%|\s/.test(hostId)) {
        hostIds.add(hostId)
      }
    }
    if (includeConfiguredHosts) {
      for (const repo of this.store?.getRepos?.() ?? []) {
        hostIds.add(getRepoExecutionHostId(repo))
      }
      for (const folder of this.store?.getFolderWorkspaces?.() ?? []) {
        if (folder.executionHostId) {
          hostIds.add(folder.executionHostId)
        } else if (folder.connectionId) {
          hostIds.add(toSshExecutionHostId(folder.connectionId))
        }
      }
    }
    return hostIds
  }

  protected buildTerminalListHostScope(
    targetWorktreeId: string | null,
    terminals: readonly RuntimeTerminalSummary[],
    worktrees: Iterable<ResolvedWorktree>,
    queriedHostIds: ReadonlySet<ExecutionHostId>
  ): { hostIds: ExecutionHostId[]; omittedHostIds: ExecutionHostId[] } {
    const known = this.listKnownExecutionHostIds(
      queriedHostIds,
      targetWorktreeId !== FLOATING_TERMINAL_WORKTREE_ID
    )
    let targetHost: ExecutionHostId | null = null
    for (const worktree of worktrees) {
      if (worktree.id === targetWorktreeId && worktree.hostId) {
        targetHost = worktree.hostId
      }
    }
    for (const worktree of worktrees) {
      if (
        worktree.hostId &&
        (parseExecutionHostId(targetHost ?? '')?.kind !== 'runtime' ||
          worktree.id === targetWorktreeId)
      ) {
        known.add(worktree.hostId)
      }
    }
    for (const terminal of terminals) {
      if (terminal.executionHostId) {
        known.add(terminal.executionHostId)
      }
    }
    const scoped = targetWorktreeId
      ? (targetHost ?? this.tryGetWorkspaceSessionHostIdForWorktree(targetWorktreeId))
      : null
    if (scoped) {
      known.add(scoped)
      if (parseExecutionHostId(scoped)?.kind === 'runtime') {
        for (const folder of this.store?.getFolderWorkspaces?.() ?? []) {
          if (
            folder.executionHostId &&
            parseExecutionHostId(folder.executionHostId)?.kind === 'runtime' &&
            folder.connectionId
          ) {
            known.delete(toSshExecutionHostId(folder.connectionId))
          }
        }
      }
    }
    if (targetWorktreeId?.startsWith('folder:')) {
      const folderId = targetWorktreeId.slice('folder:'.length)
      const folder = this.store
        ?.getFolderWorkspaces?.()
        .find((candidate) => candidate.id === folderId)
      if (
        folder?.executionHostId &&
        parseExecutionHostId(folder.executionHostId)?.kind === 'runtime' &&
        folder.connectionId
      ) {
        known.delete(toSshExecutionHostId(folder.connectionId))
      }
    }
    const candidates = targetWorktreeId ? (scoped ? [scoped] : []) : [...known]
    const covered = new Set(
      candidates.filter(
        (id) => queriedHostIds.has(id) && parseExecutionHostId(id)?.kind !== 'runtime'
      )
    )
    return {
      hostIds: [...covered].sort(),
      omittedHostIds: [...known].filter((id) => !covered.has(id)).sort()
    }
  }

  protected getWorkspaceSessionHostIdForWorktree(worktreeId: string): ExecutionHostId {
    return this.workspaceSessions.getHostId(worktreeId)
  }

  applyWorkspaceGitHubCache(
    expected: WorkspaceGitHubCacheSnapshot,
    next: WorkspaceGitHubCacheSnapshot
  ): { appliedInMemory: true; durable: false } {
    return applyWorkspaceGitHubCache(this.requireStore(), expected, next)
  }

  protected getWorkspaceSessionForWorktree(worktreeId: string): WorkspaceSessionState | null {
    return this.workspaceSessions.get(worktreeId)
  }

  listProviderSessions(scope?: PtySessionListScope): Promise<PtyListedSession[]> {
    if (!this.ptyController?.listSessions) {
      throw new Error('pty_provider_session_inventory_unavailable')
    }
    return this.ptyController.listSessions(scope)
  }

  protected getOwnWorkspaceSessionForWorktree(worktreeId: string): WorkspaceSessionState | null {
    return this.workspaceSessions.getOwnPartition(worktreeId)
  }

  protected setWorkspaceSessionForWorktree(
    worktreeId: string,
    session: WorkspaceSessionState
  ): void {
    this.workspaceSessions.setForWorktree(worktreeId, session)
  }

  readWorkspaceGitHubCache(): PersistedState['githubCache'] {
    if (!this.store?.getGitHubCache) {
      throw new Error('workspace_review_cache_store_unavailable')
    }
    return this.store.getGitHubCache()
  }

  protected getKnownWorkspaceSessionWorktreeIds(): Set<string> {
    return this.workspaceSessions.getKnownWorktreeIds()
  }

  protected getWorkspaceSessionHydrationTargets(
    includeAllPersistedWorktrees: boolean
  ): Map<string, WorkspaceSessionState> {
    return this.workspaceSessions.getHydrationTargets(includeAllPersistedWorktrees)
  }
}
