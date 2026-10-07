import { SKILL_DELETE_CAPABILITY } from '../../shared/skill-install-capability'
import {
  SkillAuthorizedShareInstallParams,
  SkillAuthorizedPackageInstallParams,
  SkillAuthorizedBundleShareInstallParams,
  SkillAuthorizedBundlePackageInstallParams
} from '../../shared/rpc-contract/skills-authorized-install-params'
import {
  skillSharePrepareIpcSchema,
  skillSharePublishIpcSchema,
  SkillPreparationIdParams,
  SkillUpdateStartParams
} from '../../shared/rpc-contract/skills-lifecycle-params'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { readJsonInput } from '../json-input'
import { RuntimeClientError } from '../runtime-client'
import { SkillsDiscoverParams } from '../../shared/rpc-contract/skills-params'
import {
  SkillInstallPreviewRequestSchema,
  SkillInstallRequestSchema,
  SkillRemoveRequestSchema
} from '../../shared/skill-install-contract'
import {
  SkillShareIdParams,
  SkillPackageIdParams,
  SkillPackageVersionParams
} from '../../shared/rpc-contract/skills-cloud-params'
import {
  SkillBundleInstallPreviewRequestSchema,
  SkillBundleInstallRequestSchema
} from '../../shared/skill-bundle-install-contract'
import { SkillDeleteRequestSchema } from '../../shared/skill-delete-contract'
import type { z } from 'zod'

function request(method: string, schema: z.ZodType): CommandHandler {
  return async (ctx) => {
    const parsed = schema.safeParse(await readJsonInput(ctx))
    if (!parsed.success) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Invalid request JSON; consult the command input contract'
      )
    }
    printResult(
      await ctx.client.call(method, parsed.data, { timeoutMs: 10 * 60_000 }),
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  }
}

export const MANAGED_SKILL_HANDLERS: Record<string, CommandHandler> = {
  'skills delete-supported': async (ctx) => {
    const status = await ctx.client.call<{ capabilities?: string[] }>('status.get')
    printResult(
      {
        ...status,
        result: {
          supported: status.result.capabilities?.includes(SKILL_DELETE_CAPABILITY) === true
        }
      },
      ctx.json,
      (value) => String(value.supported)
    )
  },
  'skills install-share': request('skills.installShare', SkillAuthorizedShareInstallParams),
  'skills install-package': request(
    'skills.installPackageVersion',
    SkillAuthorizedPackageInstallParams
  ),
  'skills install-bundle-share': request(
    'skills.installBundleShare',
    SkillAuthorizedBundleShareInstallParams
  ),
  'skills install-bundle-package': request(
    'skills.installBundlePackageVersion',
    SkillAuthorizedBundlePackageInstallParams
  ),
  'skills wsl-distros': async (ctx) => {
    printResult(await ctx.client.call('host.wsl.listDistros'), ctx.json, (value) =>
      JSON.stringify(value, null, 2)
    )
  },
  'skills update-acknowledge': async (ctx) => {
    printResult(await ctx.client.call('skills.acknowledgeUpdateRun'), ctx.json, (value) =>
      JSON.stringify(value, null, 2)
    )
  },
  'skills update-cancel': async (ctx) => {
    printResult(await ctx.client.call('skills.cancelUpdateRun'), ctx.json, (value) =>
      JSON.stringify(value, null, 2)
    )
  },
  'skills update-status': async (ctx) => {
    printResult(await ctx.client.call('skills.getUpdateRun'), ctx.json, (value) =>
      JSON.stringify(value, null, 2)
    )
  },
  'skills freshness': async (ctx) => {
    printResult(await ctx.client.call('skills.freshnessInventory'), ctx.json, (value) =>
      JSON.stringify(value, null, 2)
    )
  },
  'skills prepare-share': request('skills.prepareShare', skillSharePrepareIpcSchema),
  'skills publish-share': request('skills.publishShare', skillSharePublishIpcSchema),
  'skills cancel-share': request('skills.cancelShare', SkillPreparationIdParams),
  'skills release-share': request('skills.releaseShare', SkillPreparationIdParams),
  'skills update-start': request('skills.startUpdateRun', SkillUpdateStartParams),

  'skills resolve-share': request('skills.resolveShare', SkillShareIdParams),
  'skills package': request('skills.getPackage', SkillPackageIdParams),
  'skills revoke-share': request('skills.revokeShare', SkillShareIdParams),
  'skills delete-package': request('skills.deletePackage', SkillPackageIdParams),
  'skills delete-version': request('skills.deletePackageVersion', SkillPackageVersionParams),
  'skills preview-bundle': request(
    'skills.previewBundleInstall',
    SkillBundleInstallPreviewRequestSchema
  ),
  'skills owned-shares': async (ctx) => {
    printResult(await ctx.client.call('skills.listOwnedShares'), ctx.json, (value) =>
      JSON.stringify(value, null, 2)
    )
  },
  'skills discover': request('skills.discover', SkillsDiscoverParams),
  'skills preview-install': request('skills.previewInstall', SkillInstallPreviewRequestSchema),
  'skills install-shared': request('skills.install', SkillInstallRequestSchema),
  'skills install-bundle': request('skills.installBundle', SkillBundleInstallRequestSchema),
  'skills preview-delete': request('skills.previewDelete', SkillDeleteRequestSchema),
  'skills delete': request('skills.delete', SkillDeleteRequestSchema),
  'skills remove-install': request('skills.removeInstall', SkillRemoveRequestSchema),
  'skills managed-installs': async (ctx) => {
    printResult(await ctx.client.call('skills.listManagedInstalls'), ctx.json, (value) =>
      JSON.stringify(value, null, 2)
    )
  },
  'skills cancel-install': async (ctx) => {
    printResult(
      await ctx.client.call('skills.cancelInstall', {
        operationId: getRequiredStringFlag(ctx.flags, 'operation')
      }),
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  },
  'skills install-progress': async (ctx) => {
    printResult(
      await ctx.client.call('skills.getInstallProgress', {
        operationId: getRequiredStringFlag(ctx.flags, 'operation')
      }),
      ctx.json,
      (value) => JSON.stringify(value, null, 2)
    )
  }
}
