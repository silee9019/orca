import {
  beginVmProvisionObservation,
  observeVmProvisionOutput,
  readVmProvisionObservation,
  updateVmProvisionObservation
} from './vm-provision-observation'
import { getEphemeralVmDesktopService } from '../../../ephemeral-vm-desktop-service'
import type { OrcaVmRecipe } from '../../../../shared/orca-yaml-hook-types'
import {
  VmRepo,
  VmRuntime,
  VmWorkspace,
  VmRecipe,
  VmProvision,
  VmProvisionIdentity,
  VmAttach,
  VmStopCleanup
} from '../../../../shared/rpc-contract/ephemeral-vm-params'
import { defineMethod } from '../core'
import type { EphemeralVmRuntimeRecord } from '../../../../shared/ephemeral-vm-runtimes'

async function protectVmProviderDiagnostic<T>(operation: () => T | Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw new Error(
      error instanceof Error && /^[a-z][a-z0-9_]*$/.test(error.message)
        ? error.message
        : 'vm_operation_failed'
    )
  }
}

export function publicVmRecipe(value: OrcaVmRecipe) {
  return {
    id: value.id,
    name: value.name,
    description: value.description,
    checkoutMode: value.checkoutMode ?? 'orca-worktree',
    canSuspend: Boolean(value.suspend && value.resume),
    cleanupDisabled: value.destroyDisabled === true
  }
}

export function publicVmRuntime(value: EphemeralVmRuntimeRecord) {
  return {
    id: value.id,
    recipeId: value.recipeId,
    repoId: value.repoId,
    projectId: value.projectId,
    workspaceId: value.workspaceId,
    workspaceName: value.workspaceName,
    connectionMode: value.connectionMode,
    runtimeEnvironmentId: value.runtimeEnvironmentId,
    sshTargetId: value.sshTargetId,
    status: value.status,
    cleanupStatus: value.cleanupStatus,
    cleanupDisabled: value.cleanupDisabled,
    cleanupLastAttemptAt: value.cleanupLastAttemptAt,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  }
}

export const EPHEMERAL_VM_METHODS = [
  defineMethod({
    name: 'vm.recipes.list',
    params: VmRepo,
    handler: async (params) => {
      const result = await protectVmProviderDiagnostic(() =>
        getEphemeralVmDesktopService().listRecipes(params)
      )
      return {
        status: result.status,
        repoPath: result.repoPath,
        recipes: result.recipes.map(publicVmRecipe),
        diagnostics: (result.diagnostics ?? []).map((value) => ({
          index: value.index,
          field: value.field,
          message: 'Invalid recipe configuration.'
        })),
        ...(result.status === 'error'
          ? { message: 'Recipe catalog is unavailable for this repository.' }
          : {})
      }
    }
  }),
  defineMethod({
    name: 'vm.recipes.catalog',
    params: null,
    handler: async () =>
      (
        await protectVmProviderDiagnostic(() => getEphemeralVmDesktopService().listRecipeCatalog())
      ).map((value) => ({
        repoId: value.repoId,
        repoName: value.repoName,
        repoPath: value.repoPath,
        recipes: value.recipes.map(publicVmRecipe),
        diagnostics: (value.diagnostics ?? []).map((diagnostic) => ({
          index: diagnostic.index,
          field: diagnostic.field,
          message: 'Invalid recipe configuration.'
        }))
      }))
  }),
  defineMethod({
    name: 'vm.doctor',
    params: VmRecipe,
    handler: async (params) => {
      const value = await protectVmProviderDiagnostic(() =>
        getEphemeralVmDesktopService().doctor(params)
      )
      return {
        recipeId: value.recipeId,
        repoPath: value.repoPath,
        ok: value.ok,
        checks: value.checks.map((check) => ({
          id: check.id,
          status: check.status,
          message: `${check.id}: ${check.status}`
        }))
      }
    }
  }),
  defineMethod({
    name: 'vm.provision',
    params: VmProvision,
    handler: async (params) => {
      const service = getEphemeralVmDesktopService()
      beginVmProvisionObservation(params.provisionId)
      let completed = false
      try {
        const result = await service.provision(params, (event) =>
          observeVmProvisionOutput(event.provisionId, event.stream, event.chunk)
        )
        updateVmProvisionObservation(params.provisionId, result.ok ? 'succeeded' : 'failed')
        completed = true
        return result.ok
          ? {
              ok: true,
              connectionType: result.connectionType,
              runtime: publicVmRuntime(result.runtime),
              warnings: result.warnings.map((value) => ({ id: value.id }))
            }
          : {
              ok: false,
              error:
                'VM provisioning failed. Inspect the recipe configuration and provider state on the desktop host.'
            }
      } catch {
        throw new Error('vm_provision_failed')
      } finally {
        if (!completed) {
          updateVmProvisionObservation(params.provisionId, 'failed')
        }
      }
    }
  }),
  defineMethod({
    name: 'vm.provision.cancel',
    params: VmProvisionIdentity,
    handler: async (params) => {
      const result = getEphemeralVmDesktopService().cancelProvision(params)
      if (result.cancelled) {
        updateVmProvisionObservation(params.provisionId, 'cancel-requested')
      }
      return result
    }
  }),
  defineMethod({
    name: 'vm.provision.status',
    params: VmProvisionIdentity,
    handler: (params) => readVmProvisionObservation(params.provisionId)
  }),
  defineMethod({
    name: 'vm.runtimes.list',
    params: null,
    handler: async () => getEphemeralVmDesktopService().listRuntimes().map(publicVmRuntime)
  }),
  defineMethod({
    name: 'vm.attach',
    params: VmAttach,
    handler: async (params) =>
      publicVmRuntime(getEphemeralVmDesktopService().attachWorkspace(params))
  }),
  defineMethod({
    name: 'vm.cleanup',
    params: VmRuntime,
    handler: async (params) =>
      publicVmRuntime(
        await protectVmProviderDiagnostic(() => getEphemeralVmDesktopService().cleanup(params))
      )
  }),
  defineMethod({
    name: 'vm.cleanup.stop',
    params: VmStopCleanup,
    handler: async (params) =>
      publicVmRuntime(
        await protectVmProviderDiagnostic(() => getEphemeralVmDesktopService().stopCleanup(params))
      )
  }),
  defineMethod({
    name: 'vm.suspend',
    params: VmWorkspace,
    handler: async (params) => {
      const value = await protectVmProviderDiagnostic(() =>
        getEphemeralVmDesktopService().suspendWorkspace(params)
      )
      return value ? publicVmRuntime(value) : null
    }
  }),
  defineMethod({
    name: 'vm.resume',
    params: VmWorkspace,
    handler: async (params) => {
      const value = await protectVmProviderDiagnostic(() =>
        getEphemeralVmDesktopService().resumeWorkspace(params)
      )
      return value ? publicVmRuntime(value) : null
    }
  }),
  defineMethod({
    name: 'vm.cleanup.command',
    params: VmRuntime,
    handler: async (params) => getEphemeralVmDesktopService().getCleanupCommand(params)
  })
]
