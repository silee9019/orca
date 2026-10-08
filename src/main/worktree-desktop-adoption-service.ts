import { app } from 'electron'
import type {
  AdoptProvisionedRootArgs,
  CreateWorktreeResult
} from '../shared/worktree/create-types'
import type { CliWorkspaceProvenance } from '../shared/worktree/types'
import type { DesktopWorktreeCreateContext } from './worktree-desktop-create-service'
import { getLocalWorktreeCatalogVersion } from './local-worktree-scan-generation'
import { withWorktreeSpan } from './observability/instrumentation'
import { workspaceSourceSchema } from '../shared/telemetry-events'
import type { WorkspaceSource } from '../shared/telemetry-events'
import {
  resolveAutomationWorkspaceProvenance,
  releaseAutomationWorkspaceProvenanceRequest,
  finishAutomationWorkspaceProvenanceRequest
} from './automations/workspace-provenance'
import { isFolderRepo } from '../shared/repo-kind'
import { notifyWorktreesChanged } from './ipc/worktree-remote'
import { track } from './telemetry/client'
import { classifyWorkspaceCreateError } from './ipc/workspace-create-error-classifier'
import { getCohortAtEmit } from './telemetry/cohort-classifier'
import { adoptProvisionedRootSshCheckout } from './provisioned-root-ssh-adoption'
import { normalizeLinkedWorkItemFields } from './ipc/worktrees/ipc-context-schemas'
import {
  findExactRepoOwner,
  isCapturedRepoCurrent
} from './ipc/worktrees/listing/worktree-host-ownership'
export async function adoptDesktopProvisionedRoot(
  { mainWindow, store, runtime, options }: DesktopWorktreeCreateContext,
  rawArgs: AdoptProvisionedRootArgs,
  cliProvenance?: CliWorkspaceProvenance
): Promise<CreateWorktreeResult> {
  const args = normalizeLinkedWorkItemFields(rawArgs)
  return withWorktreeSpan({ stage: 'create' }, async () => {
    const repo = findExactRepoOwner(store, args.repoId, args.executionHostId)
    if (!repo || isFolderRepo(repo)) {
      throw new Error('Provisioned-root repository ownership is missing or ambiguous.')
    }
    const sourceParse = workspaceSourceSchema.safeParse(args.telemetrySource)
    const source: WorkspaceSource = sourceParse.success ? sourceParse.data : 'unknown'
    const automationProvenance = resolveAutomationWorkspaceProvenance({
      authority: runtime,
      repoSelector: args.repoId,
      repo,
      request: args.automationProvenanceRequest
    })
    let result: CreateWorktreeResult
    try {
      result = await adoptProvisionedRootSshCheckout({
        userDataPath: app.getPath('userData'),
        request: { ...args, automationProvenance, cliProvenance },
        repo,
        store,
        isRepoCurrent: () => isCapturedRepoCurrent(store, repo, args.executionHostId)
      })
    } catch (error) {
      releaseAutomationWorkspaceProvenanceRequest(args.automationProvenanceRequest)
      track('workspace_create_failed', {
        source,
        error_class: classifyWorkspaceCreateError(error),
        ...getCohortAtEmit()
      })
      throw error
    }
    finishAutomationWorkspaceProvenanceRequest(args.automationProvenanceRequest)
    track('workspace_created', {
      source,
      from_existing_branch: false,
      ...getCohortAtEmit()
    })
    notifyWorktreesChanged(mainWindow, repo.id)
    options?.onWorktreeLifecycle?.({
      kind: 'created',
      worktreeId: result.worktree.id,
      path: result.worktree.path,
      branch: result.worktree.branch
    })
    return { ...result, catalogVersion: getLocalWorktreeCatalogVersion(repo.id) }
  })
}
