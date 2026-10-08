import { getLocalWorktreeCatalogVersion } from './local-worktree-scan-generation'
import type { CreateWorktreeArgs, CreateWorktreeResult } from '../shared/worktree/create-types'
import type { CliWorkspaceProvenance } from '../shared/worktree/types'
import type { WorkspaceCreateEntryPoint } from '../shared/worktree/create-timing-vocabulary'
import { addWorktreeCreatePhaseAttributes, withWorktreeSpan } from './observability/instrumentation'
import {
  resolveAutomationWorkspaceProvenance,
  releaseAutomationWorkspaceProvenanceRequest,
  finishAutomationWorkspaceProvenanceRequest
} from './automations/workspace-provenance'
import { isFolderRepo } from '../shared/repo-kind'
import {
  createRemoteWorktree,
  createLocalWorktree,
  notifyWorktreesChanged
} from './ipc/worktree-remote'
import { normalizeLinkedWorkItemFields } from './ipc/worktrees/ipc-context-schemas'
import type { CreateWorktreeArgsWithSystemProvenance } from './ipc/worktrees/ipc-context-schemas'
import { createFolderWorkspace } from './ipc/worktrees/create/folder-workspace-creation'
import { requireWorktreeCreateRoute } from './worktree-create-execution-host-route'
import type { WorktreeIpcContext } from './ipc/worktrees/worktree-ipc-context'
import { beginWorkspaceCreateTelemetry } from './workspace-create-telemetry'

export type DesktopWorktreeCreateContext = Pick<
  WorktreeIpcContext,
  'mainWindow' | 'store' | 'runtime' | 'options'
>
export async function createDesktopWorktree(
  { mainWindow, store, runtime, options }: DesktopWorktreeCreateContext,
  rawArgs: CreateWorktreeArgs,
  entryPoint: WorkspaceCreateEntryPoint = 'app',
  cliProvenance?: CliWorkspaceProvenance
): Promise<CreateWorktreeResult> {
  const args = normalizeLinkedWorkItemFields(rawArgs)
  return withWorktreeSpan({ stage: 'create' }, async (span) => {
    const repo = store.getRepo(args.repoId)
    if (!repo) {
      throw new Error(`Repo not found: ${args.repoId}`)
    }

    const automationProvenance = resolveAutomationWorkspaceProvenance({
      authority: runtime,
      repoSelector: args.repoId,
      repo,
      request: args.automationProvenanceRequest
    })
    const createArgs: CreateWorktreeArgsWithSystemProvenance = {
      ...args,
      automationProvenance,
      cliProvenance
    }

    let result: CreateWorktreeResult
    const telemetry = beginWorkspaceCreateTelemetry({
      source: args.telemetrySource,
      entryPoint,
      repoPath: repo.path,
      fromExistingBranch: typeof args.baseBranch === 'string' && args.baseBranch.length > 0,
      isFolder: isFolderRepo(repo)
    })
    try {
      if (isFolderRepo(repo)) {
        result = createFolderWorkspace(createArgs, repo, store)
      } else {
        const createRoute = requireWorktreeCreateRoute(repo)
        result =
          createRoute.kind === 'ssh'
            ? await createRemoteWorktree(
                createArgs,
                createRoute.repo,
                store,
                mainWindow,
                telemetry.timing
              )
            : await createLocalWorktree(
                createArgs,
                repo,
                store,
                mainWindow,
                runtime,
                telemetry.timing
              )
      }
    } catch (error) {
      releaseAutomationWorkspaceProvenanceRequest(args.automationProvenanceRequest)
      telemetry.failed(error)
      throw error
    }
    finishAutomationWorkspaceProvenanceRequest(args.automationProvenanceRequest)
    if (result.timing) {
      addWorktreeCreatePhaseAttributes(span, result.timing)
    }

    telemetry.succeeded(result.timing)

    if (isFolderRepo(repo)) {
      notifyWorktreesChanged(mainWindow, repo.id)
    }

    options?.onWorktreeLifecycle?.({
      kind: 'created',
      worktreeId: result.worktree.id,
      path: result.worktree.path,
      branch: result.worktree.branch
    })

    return { ...result, catalogVersion: getLocalWorktreeCatalogVersion(repo.id) }
  })
}
