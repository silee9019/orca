import type { SkillInstallViewerTarget } from './skill-install-viewer-target'
import {
  skillInstallAgentViewerSnapshot,
  skillInstallAgentViewerTarget
} from './skill-install-agent-viewer-controller'
import {
  skillInstallWorkspaceViewerSnapshot,
  skillInstallWorkspaceViewerTarget
} from './skill-install-workspace-viewer-controller'
import type {
  SkillInstallPreview,
  SkillInstallResult
} from '../../../shared/skill-install-contract'
import type { ResolvedSkillShare } from '../components/skills/skill-share-version-summary'
export type SkillInstallViewerForm = SkillInstallViewerTarget & {
  open: boolean
  busy: boolean
  resolvingInitialLink: boolean
  link: string
  setLink: (value: string) => void
  inspect: () => Promise<void>
  install: (discardLocal: boolean) => Promise<void>
  cancelInstall: () => Promise<void>
  activeOperationId: string | null
  preview: ResolvedSkillShare | null
  destinationPreview: SkillInstallPreview | null
  result: SkillInstallResult | null
  error: string | null
}
export function skillInstallAgentPickerTarget(form: SkillInstallViewerForm): string {
  return skillInstallAgentViewerTarget(
    form,
    JSON.stringify([form.open, form.preview?.shareId, form.preview?.version.versionId])
  )
}
export function skillInstallViewerSnapshot(form: SkillInstallViewerForm) {
  return {
    viewer: 'desktop' as const,
    workspacePicker: skillInstallWorkspaceViewerSnapshot(skillInstallWorkspacePickerTarget(form)),
    agents: skillInstallAgentViewerSnapshot(skillInstallAgentPickerTarget(form)),
    committed: true as const,
    link: form.link,
    preview: form.preview,
    destinationPreview: form.destinationPreview,
    result: form.result,
    error: form.error,
    busy: form.busy,
    activeOperationId: form.activeOperationId,
    environmentId: form.environmentId,
    scope: form.scope,
    workspace: form.workspace,
    executionTarget: form.executionTarget,
    providers: [...form.providers]
  }
}
export function skillInstallWorkspacePickerTarget(form: SkillInstallViewerForm): string {
  return skillInstallWorkspaceViewerTarget(
    form,
    JSON.stringify([form.open, form.preview?.shareId, form.preview?.version.versionId])
  )
}
