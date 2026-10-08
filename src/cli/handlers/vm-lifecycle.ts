import { z } from 'zod'
import { RuntimeClientError } from '../runtime-client'
import { redactEphemeralVmRecipeDiagnosticText } from '../../shared/ephemeral-vm-recipe-diagnostics'
import { writeFile } from 'node:fs/promises'
import type { CommandHandler } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'

const formatVm = (value: unknown): string => JSON.stringify(value, null, 2)

export const VM_LIFECYCLE_HANDLERS: Record<string, CommandHandler> = {
  'vm recipes': async ({ client, flags, json }) => {
    printResult(
      await client.call('vm.recipes.list', { repoId: getRequiredStringFlag(flags, 'repo') }),
      json,
      formatVm
    )
  },
  'vm catalog': async ({ client, json }) => {
    printResult(await client.call('vm.recipes.catalog'), json, formatVm)
  },
  'vm doctor': async ({ client, flags, json }) => {
    printResult(
      await client.call('vm.doctor', {
        repoId: getRequiredStringFlag(flags, 'repo'),
        recipeId: getRequiredStringFlag(flags, 'recipe')
      }),
      json,
      formatVm
    )
  },
  'vm provision': async ({ client, flags, json }) => {
    const response = await client.call('vm.provision', {
      repoId: getRequiredStringFlag(flags, 'repo'),
      recipeId: getRequiredStringFlag(flags, 'recipe'),
      provisionId: getRequiredStringFlag(flags, 'provision-id'),
      workspaceName: getOptionalStringFlag(flags, 'name'),
      projectId: getOptionalStringFlag(flags, 'project'),
      workspaceId: getOptionalStringFlag(flags, 'workspace'),
      branch: getOptionalStringFlag(flags, 'branch'),
      ref: getOptionalStringFlag(flags, 'ref')
    })
    const result = z
      .object({ ok: z.boolean(), error: z.string().optional() })
      .parse(response.result)
    if (!result.ok) {
      throw new RuntimeClientError(
        'vm_provision_failed',
        redactEphemeralVmRecipeDiagnosticText(result.error ?? 'VM provisioning failed')
      )
    }
    printResult(response, json, formatVm)
  },
  'vm cancel': async ({ client, flags, json }) => {
    printResult(
      await client.call('vm.provision.cancel', {
        provisionId: getRequiredStringFlag(flags, 'provision-id')
      }),
      json,
      formatVm
    )
  },
  'vm provision-status': async ({ client, flags, json }) => {
    printResult(
      await client.call('vm.provision.status', {
        provisionId: getRequiredStringFlag(flags, 'provision-id')
      }),
      json,
      formatVm
    )
  },
  'vm runtimes': async ({ client, json }) => {
    printResult(await client.call('vm.runtimes.list'), json, formatVm)
  },
  'vm attach': async ({ client, flags, json }) => {
    printResult(
      await client.call('vm.attach', {
        runtimeId: getRequiredStringFlag(flags, 'runtime'),
        workspaceId: getRequiredStringFlag(flags, 'workspace')
      }),
      json,
      formatVm
    )
  },
  'vm cleanup': async ({ client, flags, json }) => {
    const response = await client.call('vm.cleanup', {
      runtimeId: getRequiredStringFlag(flags, 'runtime')
    })
    const result = z.object({ cleanupStatus: z.string() }).parse(response.result)
    if (result.cleanupStatus === 'failed') {
      throw new RuntimeClientError(
        'vm_cleanup_failed',
        'VM cleanup failed; inspect the runtime and retry cleanup'
      )
    }
    printResult(response, json, formatVm)
  },
  'vm stop-cleanup': async ({ client, flags, json }) => {
    const runtimeId = getRequiredStringFlag(flags, 'runtime')
    const confirmation = getRequiredStringFlag(flags, 'confirm')
    if (confirmation !== runtimeId) {
      throw new RuntimeClientError(
        'invalid_argument',
        '--confirm must match the runtime ID; stopping cleanup can leave billable resources running'
      )
    }
    printResult(await client.call('vm.cleanup.stop', { runtimeId, confirmation }), json, formatVm)
  },
  'vm suspend': async ({ client, flags, json }) => {
    printResult(
      await client.call('vm.suspend', { workspaceId: getRequiredStringFlag(flags, 'workspace') }),
      json,
      formatVm
    )
  },
  'vm resume': async ({ client, flags, json }) => {
    printResult(
      await client.call('vm.resume', { workspaceId: getRequiredStringFlag(flags, 'workspace') }),
      json,
      formatVm
    )
  },
  'vm cleanup-command': async ({ client, flags, json }) => {
    const outputFile = getRequiredStringFlag(flags, 'output-file')
    const result = await client.call<unknown>('vm.cleanup.command', {
      runtimeId: getRequiredStringFlag(flags, 'runtime')
    })
    await writeFile(outputFile, JSON.stringify(result.result, null, 2), { mode: 0o600, flag: 'wx' })
    printResult({ ...result, result: { outputFile } }, json, formatVm)
  }
}
