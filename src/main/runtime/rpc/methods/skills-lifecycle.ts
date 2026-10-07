import { defineMethod } from '../core'
import type { z } from 'zod'
import type { SkillFreshnessInventory } from '../../../../shared/skill-freshness'
import type { SkillUpdateRunner } from '../../../skills/skill-update-run'
import type { SkillSharePreparationService } from '../../../skills/skill-share-preparation-service'
import {
  skillSharePrepareIpcSchema,
  skillSharePublishIpcSchema,
  SkillPreparationIdParams,
  SkillUpdateStartParams
} from '../../../../shared/rpc-contract/skills-lifecycle-params'

type UpdateServices = {
  runner: SkillUpdateRunner
  inventory: () => Promise<SkillFreshnessInventory>
}
type ShareServices = {
  preparations: SkillSharePreparationService
  publish: (
    params: z.infer<typeof skillSharePublishIpcSchema>
  ) => ReturnType<SkillSharePreparationService['publish']>
  prepare: (
    params: z.infer<typeof skillSharePrepareIpcSchema>
  ) => ReturnType<SkillSharePreparationService['prepare']>
}
let updates: UpdateServices | null = null
let shares: ShareServices | null = null
export function setSkillUpdatesForRpc(value: UpdateServices | null): void {
  updates = value
}
export function setSkillSharingForRpc(value: ShareServices | null): void {
  shares = value
}
function updateServices(): UpdateServices {
  if (!updates) {
    throw new Error('Skill updates are not available on this runtime')
  }
  return updates
}
function shareServices(): ShareServices {
  if (!shares) {
    throw new Error('Skill preparation is not available on this runtime')
  }
  return shares
}
export const SKILL_LIFECYCLE_METHODS = [
  defineMethod({
    name: 'skills.freshnessInventory',
    params: null,
    handler: () => updateServices().inventory()
  }),
  defineMethod({
    name: 'skills.startUpdateRun',
    params: SkillUpdateStartParams,
    handler: (params) => updateServices().runner.start(params.names)
  }),
  defineMethod({
    name: 'skills.getUpdateRun',
    params: null,
    handler: () => updateServices().runner.getState()
  }),
  defineMethod({
    name: 'skills.cancelUpdateRun',
    params: null,
    handler: () => {
      const { runner } = updateServices()
      runner.cancel()
      return runner.getState()
    }
  }),
  defineMethod({
    name: 'skills.acknowledgeUpdateRun',
    params: null,
    handler: () => {
      const { runner } = updateServices()
      runner.acknowledge()
      return runner.getState()
    }
  }),
  defineMethod({
    name: 'skills.prepareShare',
    params: skillSharePrepareIpcSchema,
    handler: (params, { runtime, clientKind }) => {
      runtime.assertAgentSkillSharingAllowed()
      if (clientKind !== undefined) {
        throw new Error('Prepare shares on the machine that stores the skills')
      }
      return shareServices().prepare(params)
    }
  }),
  defineMethod({
    name: 'skills.publishShare',
    params: skillSharePublishIpcSchema,
    handler: (params, { runtime, clientKind, signal }) => {
      runtime.assertAgentSkillSharingAllowed()
      if (clientKind !== undefined) {
        throw new Error('Publish shares on the machine that stores the skills')
      }
      const { preparations } = shareServices()
      const cancel = () => preparations.cancel(params.preparationId)
      if (signal?.aborted) {
        throw new Error('Skill share cancelled')
      }
      signal?.addEventListener('abort', cancel, { once: true })
      return shareServices()
        .publish(params)
        .finally(() => signal?.removeEventListener('abort', cancel))
    }
  }),
  defineMethod({
    name: 'skills.cancelShare',
    params: SkillPreparationIdParams,
    handler: (params) => {
      shareServices().preparations.cancel(params.preparationId)
      return { cancelled: true }
    }
  }),
  defineMethod({
    name: 'skills.releaseShare',
    params: SkillPreparationIdParams,
    handler: async (params) => {
      await shareServices().preparations.release(params.preparationId)
      return { released: true }
    }
  })
]
