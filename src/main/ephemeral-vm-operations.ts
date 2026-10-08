import { setEphemeralVmDesktopService } from './ephemeral-vm-desktop-service'
import { EphemeralVmRuntimeOperations } from './ephemeral-vm-runtime-operations'
import type { Store } from './persistence'
import { updateEphemeralVmRuntimeStatus } from '../shared/ephemeral-vm-runtime-store'
import type { EphemeralVmRuntimeRecord } from '../shared/ephemeral-vm-runtimes'
import {
  getEphemeralVmRecipeResultConnection,
  type EphemeralVmRecipeDoctorResult
} from '../shared/ephemeral-vm-recipes'
import { addEnvironmentFromPairingCode } from '../shared/runtime-environment-store'
import {
  cleanupEphemeralVmRuntime,
  provisionEphemeralVmRuntime
} from './ephemeral-vm-runtime-service'

import { connectRuntimeOwnedSshTarget } from './ephemeral-vm-runtime-ssh'
import {
  getRecipeRepo,
  listRecipeCatalog,
  listRecipes,
  resolveRecipeForRepo,
  type EphemeralVmRecipeCatalogEntry
} from './ipc/ephemeral-vm-recipe-context'

import {
  getEphemeralVmRecipeResultWarnings,
  redactEphemeralVmRecipeDiagnosticText,
  type EphemeralVmRecipeResultWarning
} from '../shared/ephemeral-vm-recipe-diagnostics'
import { getProvisionedRootRecipeRepoUrl } from '../shared/ephemeral-vm-recipe-repo-url'
import { doctorEphemeralVmRecipe } from '../shared/ephemeral-vm-recipe-doctor'

import {
  redactRuntimeEnvironment,
  type PublicKnownRuntimeEnvironment
} from '../shared/runtime-environments'

import type { PluginService } from './plugins/plugin-service'
import { getApprovedPluginVmRecipes } from './plugins/plugin-approved-vm-recipes'
import { resolveProvisionedRootSource } from './ephemeral-vm-provisioned-root-source'
const activeProvisionControllers = new Map<string, AbortController>()

export type EphemeralVmProvisionIpcResult =
  | {
      ok: true
      connectionType: 'orca-server'
      runtime: EphemeralVmRuntimeRecord
      environment: PublicKnownRuntimeEnvironment
      stderr: string
      warnings: EphemeralVmRecipeResultWarning[]
    }
  | {
      ok: true
      connectionType: 'ssh'
      runtime: EphemeralVmRuntimeRecord
      sshTargetId: string
      expectedRefHead?: string
      stderr: string
      warnings: EphemeralVmRecipeResultWarning[]
    }
  | {
      ok: false
      error: string
      stderr: string
      stdout: string
    }

export class EphemeralVmOperations extends EphemeralVmRuntimeOperations {
  constructor(
    store: Store,
    userDataPath: string,
    private readonly pluginService?: PluginService
  ) {
    super(store, userDataPath)
  }
  async listRecipes(args: { repoId: string }) {
    return listRecipes(
      this.store,
      args.repoId,
      await getApprovedPluginVmRecipes(this.pluginService)
    )
  }

  async listRecipeCatalog(): Promise<EphemeralVmRecipeCatalogEntry[]> {
    return listRecipeCatalog(this.store, await getApprovedPluginVmRecipes(this.pluginService))
  }

  async doctor(args: { repoId: string; recipeId: string }): Promise<EphemeralVmRecipeDoctorResult> {
    const repo = getRecipeRepo(this.store, args.repoId)
    if (!repo.ok) {
      return repo.doctor(args.recipeId)
    }
    const pluginRecipes = await getApprovedPluginVmRecipes(this.pluginService)
    return doctorEphemeralVmRecipe({
      repoPath: repo.repo.path,
      recipeId: args.recipeId,
      recipes: listRecipes(this.store, args.repoId, pluginRecipes).recipes,
      localExecutionSupported: true
    })
  }

  async provision(
    args: {
      repoId: string
      recipeId: string
      workspaceName?: string
      projectId?: string
      workspaceId?: string
      branch?: string
      ref?: string
      provisionId?: string
    },
    onProvisionEvent?: (event: {
      provisionId: string
      stream: 'stdout' | 'stderr'
      chunk: string
    }) => void
  ): Promise<EphemeralVmProvisionIpcResult> {
    const repo = getRecipeRepo(this.store, args.repoId)
    if (!repo.ok) {
      return { ok: false, error: repo.message, stdout: '', stderr: '' }
    }
    const recipe = resolveRecipeForRepo(
      repo.repo.path,
      args.recipeId,
      await getApprovedPluginVmRecipes(this.pluginService)
    )
    if (!recipe) {
      return { ok: false, error: `Recipe not found: ${args.recipeId}`, stdout: '', stderr: '' }
    }
    const controller = args.provisionId ? new AbortController() : null
    if (args.provisionId && controller) {
      if (activeProvisionControllers.has(args.provisionId)) {
        throw new Error('provision_id_in_use')
      }
      activeProvisionControllers.set(args.provisionId, controller)
    }
    const sendProvisionEvent = (stream: 'stdout' | 'stderr', chunk: string): void => {
      if (!args.provisionId) {
        return
      }
      onProvisionEvent?.({
        provisionId: args.provisionId,
        stream,
        chunk: redactEphemeralVmRecipeDiagnosticText(chunk)
      })
    }
    // Keep cancellation available through provider creation and SSH connection.
    try {
      let recipeRepoUrl = repo.repo.gitRemoteIdentity?.remoteUrl
      let sourceRef = args.ref
      let expectedRefHead: string | undefined
      if (recipe.checkoutMode === 'provisioned-root') {
        const source = await resolveProvisionedRootSource(
          this.store,
          repo.repo,
          args.ref,
          controller?.signal
        )
        if (controller?.signal.aborted) {
          return { ok: false, error: 'Provisioning cancelled.', stdout: '', stderr: '' }
        }
        if (!source) {
          return {
            ok: false,
            error: args.ref
              ? `Could not resolve provisioned-root start ref: ${args.ref}`
              : 'Could not resolve a default provisioned-root start ref.',
            stdout: '',
            stderr: ''
          }
        }
        sourceRef = source.ref
        expectedRefHead = source.head
        recipeRepoUrl = source.remoteUrl ?? recipeRepoUrl
      }
      const repoUrl = getProvisionedRootRecipeRepoUrl(recipe.checkoutMode, recipeRepoUrl)
      const result = await provisionEphemeralVmRuntime({
        userDataPath: this.userDataPath,
        repoPath: repo.repo.path,
        repoId: repo.repo.id,
        recipe,
        projectId: args.projectId,
        workspaceId: args.workspaceId,
        workspaceName: args.workspaceName,
        ...(repoUrl ? { repoUrl } : {}),
        ...(args.branch ? { branch: args.branch } : {}),
        ...(sourceRef ? { ref: sourceRef } : {}),
        ...(expectedRefHead ? { expectedRefHead } : {}),
        ...(controller ? { signal: controller.signal } : {}),
        onStdout: (chunk) => sendProvisionEvent('stdout', chunk),
        onStderr: (chunk) => sendProvisionEvent('stderr', chunk)
      })
      if (!result.ok) {
        return {
          ok: false,
          error: result.start.error,
          stdout: redactEphemeralVmRecipeDiagnosticText(result.start.stdout),
          stderr: redactEphemeralVmRecipeDiagnosticText(result.start.stderr)
        }
      }
      const connection = getEphemeralVmRecipeResultConnection(result.start.result)
      if (connection.type === 'ssh') {
        try {
          const ssh = await connectRuntimeOwnedSshTarget({
            runtimeId: result.runtime.id,
            connection,
            ...(controller ? { signal: controller.signal } : {})
          })
          const runtime = updateEphemeralVmRuntimeStatus(this.userDataPath, result.runtime.id, {
            sshTargetId: ssh.targetId
          })
          return {
            ok: true,
            connectionType: 'ssh',
            runtime,
            sshTargetId: ssh.targetId,
            ...(expectedRefHead ? { expectedRefHead } : {}),
            stderr: redactEphemeralVmRecipeDiagnosticText(result.start.stderr),
            warnings: getEphemeralVmRecipeResultWarnings(result.start.result)
          }
        } catch (error) {
          await cleanupEphemeralVmRuntime({
            userDataPath: this.userDataPath,
            repoPath: repo.repo.path,
            recipe,
            runtimeId: result.runtime.id
          }).catch(() => undefined)
          return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            stdout: redactEphemeralVmRecipeDiagnosticText(result.start.stdout),
            stderr: redactEphemeralVmRecipeDiagnosticText(result.start.stderr)
          }
        }
      }

      let environment: ReturnType<typeof addEnvironmentFromPairingCode>
      try {
        environment = addEnvironmentFromPairingCode(this.userDataPath, {
          name: buildEphemeralEnvironmentName(repo.repo.displayName, result.runtime.id),
          pairingCode: connection.pairingCode,
          source: 'ephemeral-vm'
        })
      } catch (error) {
        await cleanupEphemeralVmRuntime({
          userDataPath: this.userDataPath,
          repoPath: repo.repo.path,
          recipe,
          runtimeId: result.runtime.id
        }).catch(() => undefined)
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          stdout: redactEphemeralVmRecipeDiagnosticText(result.start.stdout),
          stderr: redactEphemeralVmRecipeDiagnosticText(result.start.stderr)
        }
      }
      const runtime = updateEphemeralVmRuntimeStatus(this.userDataPath, result.runtime.id, {
        runtimeEnvironmentId: environment.id
      })
      return {
        ok: true,
        connectionType: 'orca-server',
        runtime,
        environment: redactRuntimeEnvironment(environment),
        stderr: redactEphemeralVmRecipeDiagnosticText(result.start.stderr),
        warnings: getEphemeralVmRecipeResultWarnings(result.start.result)
      }
    } finally {
      if (args.provisionId) {
        activeProvisionControllers.delete(args.provisionId)
      }
    }
  }

  cancelProvision(args: { provisionId: string }): { cancelled: boolean } {
    const controller = activeProvisionControllers.get(args.provisionId)
    if (!controller || controller.signal.aborted) {
      return { cancelled: false }
    }
    controller.abort()
    return { cancelled: true }
  }
}

function buildEphemeralEnvironmentName(repoName: string, runtimeId: string): string {
  return `${repoName} VM ${runtimeId.slice(-8)}`
}
export function initializeEphemeralVmOperations(
  store: Store,
  userDataPath: string,
  pluginService?: PluginService
): EphemeralVmOperations {
  const operations = new EphemeralVmOperations(store, userDataPath, pluginService)
  setEphemeralVmDesktopService(operations)
  return operations
}
