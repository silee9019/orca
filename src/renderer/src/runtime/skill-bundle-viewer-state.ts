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
  SkillBundleInstallPreview,
  SkillBundleInstallResult
} from '../../../shared/skill-bundle-install-contract'
export type SkillBundleViewerForm = SkillInstallViewerTarget & {
  identity: string
  skillIds: readonly string[]
  selectedSkillIds: ReadonlySet<string>
  replaceSkillIds: ReadonlySet<string>
  setSelectedSkillIds: (value: Set<string>) => void
  setReplaceSkillIds: (value: Set<string>) => void
  destinationPreview: SkillBundleInstallPreview | null
  result: SkillBundleInstallResult | null
  retryIds: ReadonlySet<string>
  busy: boolean
  error: string | null
  activeOperationId: string | null
  install: (requestedIds?: ReadonlySet<string>, reusePreview?: boolean) => Promise<void>
  cancelInstall: () => Promise<void>
  close: () => void
}
export function skillBundleViewerSnapshot(form: SkillBundleViewerForm, closed = false) {
  return {
    viewer: 'desktop' as const,
    workspacePicker: skillInstallWorkspaceViewerSnapshot(skillBundleWorkspacePickerTarget(form)),
    agents: skillInstallAgentViewerSnapshot(skillInstallAgentViewerTarget(form, form.identity)),
    committed: true as const,
    closed,
    skillIds: form.skillIds,
    selectedSkillIds: [...form.selectedSkillIds],
    replaceSkillIds: [...form.replaceSkillIds],
    destinationPreview: form.destinationPreview,
    result: form.result,
    busy: form.busy,
    error: form.error,
    activeOperationId: form.activeOperationId,
    environmentId: form.environmentId,
    scope: form.scope,
    workspace: form.workspace,
    executionTarget: form.executionTarget,
    providers: [...form.providers]
  }
}
export function skillBundleWorkspacePickerTarget(form: SkillBundleViewerForm): string {
  return skillInstallWorkspaceViewerTarget(form, form.identity)
}
