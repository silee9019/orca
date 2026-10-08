import type { SkillInstallTargetViewerAction } from '../../../shared/skill-install-viewer-command'
import type { SkillInstallProviderId } from '../../../shared/skill-install-providers'

export type SkillInstallViewerTarget = {
  environmentId: string
  availableEnvironments: readonly string[]
  ownerRevisions: ReadonlyMap<string, string>
  setEnvironmentId: (value: string) => void
  scope: 'global' | 'workspace'
  setScope: (value: 'global' | 'workspace') => void
  workspace: string
  availableWorkspaces: readonly string[]
  setWorkspace: (value: string) => void
  executionTarget: { kind: 'wsl'; distro: string } | null
  setExecutionTarget: (value: { kind: 'wsl'; distro: string } | null) => void
  providers: ReadonlySet<SkillInstallProviderId>
  setProviders: (value: Set<SkillInstallProviderId>) => void
  clearDestinationPreview: () => void
}
export async function validateSkillInstallViewerTarget(
  current: SkillInstallViewerTarget,
  action: SkillInstallTargetViewerAction
): Promise<void> {
  if (action.kind === 'environment' && !current.availableEnvironments.includes(action.value)) {
    throw new Error('skill_environment_unavailable')
  }
  if (
    action.kind === 'workspace' &&
    (current.scope !== 'workspace' ||
      (action.value && !current.availableWorkspaces.includes(action.value)))
  ) {
    throw new Error('skill_workspace_unavailable')
  }
  if (action.kind === 'execution' && action.value) {
    if (current.scope !== 'global' || current.environmentId.startsWith('ssh:')) {
      throw new Error('skill_execution_target_unavailable')
    }
    const distros = await window.api.skills.listWslDistros(
      current.environmentId === 'local' ? undefined : current.environmentId
    )
    if (!distros.includes(action.value.distro)) {
      throw new Error('skill_execution_target_unavailable')
    }
  }
}
export function applySkillInstallViewerTarget(
  current: SkillInstallViewerTarget,
  action: SkillInstallTargetViewerAction
): void {
  switch (action.kind) {
    case 'environment':
      current.setEnvironmentId(action.value)
      current.setWorkspace('')
      current.setExecutionTarget(null)
      current.clearDestinationPreview()
      break
    case 'scope':
      current.setScope(action.value)
      current.clearDestinationPreview()
      break
    case 'workspace':
      current.setWorkspace(action.value)
      current.clearDestinationPreview()
      break
    case 'execution':
      current.setExecutionTarget(action.value)
      current.clearDestinationPreview()
      break
    case 'providers':
      current.setProviders(new Set(action.value))
      break
  }
}
