import { randomUUID } from 'node:crypto'
import { defineMethod } from '../core'
import {
  SkillAuthorizedShareInstallParams,
  SkillAuthorizedPackageInstallParams,
  SkillAuthorizedBundleShareInstallParams,
  SkillAuthorizedBundlePackageInstallParams
} from '../../../../shared/rpc-contract/skills-authorized-install-params'
import { classifySkillCloudInstallTarget } from '../../../skills/skill-cloud-install-target'
import { assertSkillCloudGrantVersion } from '../../../skills/skill-cloud-grant-version'
import {
  installSkillCloudGrant,
  installSkillBundleCloudGrant
} from '../../../skills/skill-cloud-grant-installation'

export const SKILL_AUTHORIZED_INSTALL_METHODS = [
  defineMethod({
    name: 'skills.installShare',
    params: SkillAuthorizedShareInstallParams,
    handler: async (params, { runtime, signal }) => {
      const input = { ...params, operationId: params.operationId ?? randomUUID() }
      const installTarget = await classifySkillCloudInstallTarget(runtime, input)
      const grant = await runtime.createSkillDownloadGrant(input.shareId, {
        versionId: input.versionId,
        installTarget
      })
      if (grant.status !== 'ok') {
        return grant
      }
      assertSkillCloudGrantVersion(grant.value, input.versionId)
      return installSkillCloudGrant(runtime, grant.value, input, signal)
    }
  }),
  defineMethod({
    name: 'skills.installPackageVersion',
    params: SkillAuthorizedPackageInstallParams,
    handler: async (params, { runtime, signal }) => {
      const input = { ...params, operationId: params.operationId ?? randomUUID() }
      const installTarget = await classifySkillCloudInstallTarget(runtime, input)
      const grant = await runtime.createSkillPackageVersionDownloadGrant(
        input.packageId,
        input.versionId,
        { installTarget }
      )
      if (grant.status !== 'ok') {
        return grant
      }
      assertSkillCloudGrantVersion(grant.value, input.versionId)
      return installSkillCloudGrant(runtime, grant.value, input, signal)
    }
  }),
  defineMethod({
    name: 'skills.installBundleShare',
    params: SkillAuthorizedBundleShareInstallParams,
    handler: async (params, { runtime, signal }) => {
      const input = { ...params, operationId: params.operationId ?? randomUUID() }
      const installTarget = await classifySkillCloudInstallTarget(runtime, input)
      const grant = await runtime.createSkillDownloadGrant(input.shareId, {
        versionId: input.versionId,
        installTarget
      })
      if (grant.status !== 'ok') {
        return grant
      }
      assertSkillCloudGrantVersion(grant.value, input.versionId)
      return installSkillBundleCloudGrant(runtime, grant.value, input, signal)
    }
  }),
  defineMethod({
    name: 'skills.installBundlePackageVersion',
    params: SkillAuthorizedBundlePackageInstallParams,
    handler: async (params, { runtime, signal }) => {
      const input = { ...params, operationId: params.operationId ?? randomUUID() }
      const installTarget = await classifySkillCloudInstallTarget(runtime, input)
      const grant = await runtime.createSkillPackageVersionDownloadGrant(
        input.packageId,
        input.versionId,
        { installTarget }
      )
      if (grant.status !== 'ok') {
        return grant
      }
      assertSkillCloudGrantVersion(grant.value, input.versionId)
      return installSkillBundleCloudGrant(runtime, grant.value, input, signal)
    }
  })
]
