import type { RefObject } from 'react'
import { useAppStore } from '@/store'
import type { AutomationViewerAction } from '../../../shared/automation-viewer-command'
import { versionSettingsTarget } from '../components/automations/automation-host-recovery'
import { automationViewerRecoveryTarget } from './automation-page-viewer-async'
import {
  automationViewerSnapshot,
  type AutomationViewerPage,
  type AutomationViewerState
} from './automation-page-viewer-state'
import type { AutomationViewerRequest } from './automation-page-viewer-commit'

export function isAutomationSettingsHandoff(action: AutomationViewerAction): boolean {
  return action.kind === 'host-recover' && action.action === 'update-server'
}

export function startAutomationViewerSettingsHandoff(
  page: AutomationViewerPage,
  action: Extract<AutomationViewerAction, { kind: 'host-recover' }>,
  pending: RefObject<AutomationViewerRequest | null>
): Promise<AutomationViewerState> {
  const entry = automationViewerRecoveryTarget(page, action)
  const navigationTarget = versionSettingsTarget(entry)
  const before = automationViewerSnapshot(page)
  return new Promise((resolve, reject) => {
    const request: AutomationViewerRequest = { action, ready: false, resolve, reject }
    pending.current = request
    void page.recoverListHost('update-server', entry).then(
      (outcome) => {
        const store = useAppStore.getState()
        const target = store.settingsNavigationTarget
        const applied =
          outcome.operation === 'settled' &&
          store.activeView === 'settings' &&
          target?.pane === navigationTarget.pane &&
          target.repoId === navigationTarget.repoId &&
          target.sectionId === navigationTarget.sectionId &&
          target.hostId === navigationTarget.hostId &&
          target.intent === navigationTarget.intent
        pending.current = null
        resolve({
          ...before,
          committed: false,
          recovery: {
            ...outcome,
            operation: applied ? 'navigation-requested' : 'failed',
            navigationTarget
          }
        })
      },
      (error: unknown) => {
        pending.current = null
        reject(error instanceof Error ? error : new Error('automation_settings_handoff_failed'))
      }
    )
  })
}

export function releaseAutomationViewerRequest(pending: RefObject<AutomationViewerRequest | null>) {
  const request = pending.current
  if (request && !isAutomationSettingsHandoff(request.action)) {
    request.reject(new Error('viewer_unmounted'))
    pending.current = null
  }
}
