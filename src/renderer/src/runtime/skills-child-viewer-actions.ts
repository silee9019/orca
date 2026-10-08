import {
  applySkillFreshnessViewerAction,
  type SkillFreshnessViewerState
} from './skill-freshness-viewer-controller'
import {
  applySkillListViewerAction,
  type SkillListViewerState
} from './skill-list-viewer-controller'
import {
  applySkillShareViewerAction,
  type SkillShareViewerState
} from './skill-share-viewer-controller'
import type { SkillsViewerAction } from '../../../shared/skills-viewer-command'
import {
  applySkillInstallViewerAction,
  type SkillInstallViewerState
} from './skill-install-viewer-controller'
import {
  applySkillBundleViewerAction,
  type SkillBundleViewerState
} from './skill-bundle-viewer-controller'
import {
  applyManagedSkillViewerAction,
  type ManagedSkillViewerState
} from './managed-skill-viewer-controller'

export type SkillsChildViewerState = {
  install?: SkillInstallViewerState
  bundle?: SkillBundleViewerState
  managed?: ManagedSkillViewerState
  share?: SkillShareViewerState
  list?: SkillListViewerState
  freshness?: SkillFreshnessViewerState
}
type SkillsChildViewerAction = Extract<
  SkillsViewerAction,
  {
    kind:
      | 'install-form'
      | 'bundle-form'
      | 'managed-form'
      | 'share-form'
      | 'list-form'
      | 'freshness-form'
  }
>
export function isSkillsChildViewerAction(
  action: SkillsViewerAction
): action is SkillsChildViewerAction {
  return (
    action.kind === 'install-form' ||
    action.kind === 'bundle-form' ||
    action.kind === 'managed-form' ||
    action.kind === 'share-form' ||
    action.kind === 'list-form' ||
    action.kind === 'freshness-form'
  )
}
export function requireSkillsChildViewerAvailable(
  action: SkillsChildViewerAction,
  page: {
    installOpen: boolean
    managementOpen: boolean
    shareSkills: readonly unknown[]
    view: 'skills' | 'shared'
  }
): void {
  const available =
    action.kind === 'freshness-form' ||
    (action.kind === 'managed-form'
      ? page.managementOpen
      : action.kind === 'list-form'
        ? page.view === 'skills'
        : action.kind === 'share-form'
          ? page.shareSkills.length > 0
          : page.installOpen)
  if (!available) {
    throw new Error('viewer_unavailable')
  }
}
export async function applySkillsChildViewerAction(
  action: SkillsChildViewerAction
): Promise<SkillsChildViewerState> {
  switch (action.kind) {
    case 'freshness-form':
      return { freshness: await applySkillFreshnessViewerAction(action.action) }
    case 'install-form':
      return { install: await applySkillInstallViewerAction(action.action) }
    case 'bundle-form':
      return { bundle: await applySkillBundleViewerAction(action.action) }
    case 'list-form':
      return { list: await applySkillListViewerAction(action.action) }
    case 'share-form':
      return { share: await applySkillShareViewerAction(action.action) }
    case 'managed-form':
      return { managed: await applyManagedSkillViewerAction(action.action) }
  }
}
