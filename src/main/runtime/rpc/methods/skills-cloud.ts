import { defineMethod } from '../core'
import {
  SkillShareIdParams,
  SkillPackageIdParams,
  SkillPackageVersionParams
} from '../../../../shared/rpc-contract/skills-cloud-params'
import { SkillBundleInstallPreviewRequestSchema } from '../../../../shared/skill-bundle-install-contract'

export const SKILL_CLOUD_METHODS = [
  defineMethod({
    name: 'skills.resolveShare',
    params: SkillShareIdParams,
    handler: (params, { runtime }) => runtime.resolveSkillShare(params.shareId, {})
  }),
  defineMethod({
    name: 'skills.getPackage',
    params: SkillPackageIdParams,
    handler: (params, { runtime }) => runtime.getSkillPackage(params.packageId, {})
  }),
  defineMethod({
    name: 'skills.listOwnedShares',
    params: null,
    handler: (_params, { runtime }) => runtime.listOwnedSkillShares({})
  }),
  defineMethod({
    name: 'skills.revokeShare',
    params: SkillShareIdParams,
    handler: (params, { runtime }) => runtime.revokeSkillShare(params.shareId, {})
  }),
  defineMethod({
    name: 'skills.deletePackageVersion',
    params: SkillPackageVersionParams,
    handler: (params, { runtime }) =>
      runtime.deleteSkillPackageVersion(params.packageId, params.versionId, {})
  }),
  defineMethod({
    name: 'skills.deletePackage',
    params: SkillPackageIdParams,
    handler: (params, { runtime }) => runtime.deleteSkillPackage(params.packageId, {})
  }),
  defineMethod({
    name: 'skills.previewBundleInstall',
    params: SkillBundleInstallPreviewRequestSchema,
    handler: (params, { runtime }) => runtime.previewSharedSkillBundleInstallRequest(params)
  })
]
