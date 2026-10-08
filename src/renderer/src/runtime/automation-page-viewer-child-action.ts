import { applyAutomationContent, isAutomationContentBusy } from './automation-content-viewer'
import {
  applyAutomationOwnerNotice,
  isAutomationOwnerNoticeBusy
} from './automation-owner-notice-viewer'
import {
  applyAutomationHistoryRecovery,
  isAutomationHistoryViewerBusy
} from './automation-history-viewer'
import {
  applyExternalAutomationRunTableViewer,
  isExternalAutomationRunTableViewerBusy
} from './external-automation-run-table-viewer'
import {
  applyAutomationRunPageViewer,
  isAutomationRunPageViewerBusy
} from './automation-run-page-viewer'
import { applyAutomationSaveViewer, isAutomationSaveViewerBusy } from './automation-save-viewer'
import {
  applyAutomationRunNavigation,
  isAutomationRunNavigationBusy
} from './automation-run-navigation-viewer'
import type { AutomationViewerAction } from '../../../shared/automation-viewer-command'
import {
  automationViewerSnapshot,
  type AutomationViewerPage,
  type AutomationViewerState
} from './automation-page-viewer-state'
import {
  applyAutomationRowViewerAction,
  isAutomationRowViewerBusy
} from './automation-row-viewer-controller'
import {
  applyAutomationDeleteViewerAction,
  isAutomationDeleteViewerBusy
} from './automation-delete-viewer-controller'
import { applyAutomationEditorViewerAction } from './automation-editor-viewer-controller'
import {
  applyAutomationRunsViewerAction,
  isAutomationRunsViewerBusy
} from './automation-runs-viewer-controller'

export function isAutomationViewerChildAction(action: AutomationViewerAction): action is Extract<
  AutomationViewerAction,
  {
    kind:
      | 'content-disclosure'
      | 'owner-notice-dismiss'
      | 'owner-notice-recover'
      | 'history-recover'
      | 'history-open'
      | 'external-runs-form'
      | 'run-page-form'
      | 'row-form'
      | 'delete-form'
      | 'editor-form'
      | 'runs-form'
      | 'runs-open'
      | 'editor-save'
  }
> {
  return [
    'content-disclosure',
    'owner-notice-dismiss',
    'owner-notice-recover',
    'history-recover',
    'history-open',
    'external-runs-form',
    'run-page-form',
    'row-form',
    'delete-form',
    'editor-form',
    'runs-form',
    'runs-open',
    'editor-save'
  ].includes(action.kind)
}

export function applyAutomationViewerChildAction(
  getPage: () => AutomationViewerPage,
  action: AutomationViewerAction,
  rootBusy: boolean
): Promise<AutomationViewerState> | null {
  const { local } = getPage()
  if (isAutomationSaveViewerBusy() || isAutomationRunNavigationBusy()) {
    throw new Error('viewer_busy')
  }
  if (action.kind === 'content-disclosure') {
    if (
      rootBusy ||
      isAutomationOwnerNoticeBusy() ||
      isAutomationRowViewerBusy() ||
      isAutomationDeleteViewerBusy() ||
      isAutomationRunsViewerBusy() ||
      isAutomationRunPageViewerBusy() ||
      isExternalAutomationRunTableViewerBusy() ||
      isAutomationHistoryViewerBusy()
    ) {
      throw new Error('viewer_busy')
    }
    if (local.createOpen || local.deleteTarget || local.externalDeleteTarget) {
      throw new Error('viewer_modal_open')
    }
    return applyAutomationContent(action.expanded, action.reviewedTarget).then(
      (contentDisclosure) => ({ ...automationViewerSnapshot(getPage()), contentDisclosure })
    )
  }
  if (isAutomationContentBusy()) {
    throw new Error('viewer_busy')
  }
  if (action.kind === 'owner-notice-dismiss' || action.kind === 'owner-notice-recover') {
    if (
      rootBusy ||
      isAutomationRowViewerBusy() ||
      isAutomationDeleteViewerBusy() ||
      isAutomationRunsViewerBusy() ||
      isAutomationRunPageViewerBusy() ||
      isExternalAutomationRunTableViewerBusy() ||
      isAutomationHistoryViewerBusy()
    ) {
      throw new Error('viewer_busy')
    }
    if (local.createOpen || local.deleteTarget || local.externalDeleteTarget) {
      throw new Error('viewer_modal_open')
    }
    return applyAutomationOwnerNotice(
      action.kind === 'owner-notice-dismiss'
        ? { kind: 'dismiss' }
        : { kind: 'recover', action: action.action },
      action.reviewedTarget
    ).then((ownerNoticeResult) => ({ ...automationViewerSnapshot(getPage()), ownerNoticeResult }))
  }
  if (isAutomationOwnerNoticeBusy()) {
    throw new Error('viewer_busy')
  }
  if (action.kind === 'history-recover') {
    if (
      rootBusy ||
      isAutomationRowViewerBusy() ||
      isAutomationDeleteViewerBusy() ||
      isAutomationRunsViewerBusy() ||
      isAutomationRunPageViewerBusy() ||
      isExternalAutomationRunTableViewerBusy()
    ) {
      throw new Error('viewer_busy')
    }
    if (local.createOpen || local.deleteTarget || local.externalDeleteTarget) {
      throw new Error('viewer_modal_open')
    }
    return applyAutomationHistoryRecovery(action.action, action.reviewedTarget).then(
      (historyRecovery) => ({ ...automationViewerSnapshot(getPage()), historyRecovery })
    )
  }
  if (isAutomationHistoryViewerBusy()) {
    throw new Error('viewer_busy')
  }
  if (action.kind === 'external-runs-form') {
    if (
      rootBusy ||
      isAutomationRowViewerBusy() ||
      isAutomationDeleteViewerBusy() ||
      isAutomationRunsViewerBusy() ||
      isAutomationRunPageViewerBusy()
    ) {
      throw new Error('viewer_busy')
    }
    if (local.createOpen || local.deleteTarget || local.externalDeleteTarget) {
      throw new Error('viewer_modal_open')
    }
    return applyExternalAutomationRunTableViewer(action.tableKey, action.action).then(
      (externalRunsForm) => ({ ...automationViewerSnapshot(getPage()), externalRunsForm })
    )
  }
  if (isExternalAutomationRunTableViewerBusy()) {
    throw new Error('viewer_busy')
  }
  if (action.kind === 'run-page-form') {
    if (
      rootBusy ||
      isAutomationRowViewerBusy() ||
      isAutomationDeleteViewerBusy() ||
      isAutomationRunsViewerBusy()
    ) {
      throw new Error('viewer_busy')
    }
    return applyAutomationRunPageViewer(action.action).then((runPageForm) => ({
      ...automationViewerSnapshot(getPage()),
      runPageForm
    }))
  }
  if (isAutomationRunPageViewerBusy()) {
    throw new Error('viewer_busy')
  }
  if (action.kind === 'editor-save') {
    if (
      rootBusy ||
      isAutomationRowViewerBusy() ||
      isAutomationDeleteViewerBusy() ||
      isAutomationRunsViewerBusy()
    ) {
      throw new Error('viewer_busy')
    }
    if (!local.createOpen || local.deleteTarget || local.externalDeleteTarget) {
      throw new Error('viewer_unavailable')
    }
    return applyAutomationSaveViewer(action.reviewedTarget, action.reviewedDraft).then((save) => ({
      ...automationViewerSnapshot(getPage()),
      committed: save.reviewStatus === 'current',
      save
    }))
  }
  if (
    action.kind === 'history-open' ||
    action.kind === 'runs-open' ||
    action.kind === 'runs-form'
  ) {
    if (rootBusy || isAutomationRowViewerBusy() || isAutomationDeleteViewerBusy()) {
      throw new Error('viewer_busy')
    }
    if (local.createOpen || local.deleteTarget || local.externalDeleteTarget) {
      throw new Error('viewer_modal_open')
    }
    if (action.kind === 'history-open') {
      return applyAutomationRunNavigation(action.runId, action.reviewedTarget, 'history').then(
        (runNavigation) => ({ ...automationViewerSnapshot(getPage()), runNavigation })
      )
    }
    if (action.kind === 'runs-open') {
      return applyAutomationRunNavigation(action.entryKey, action.reviewedTarget).then(
        (runNavigation) => ({
          ...automationViewerSnapshot(getPage()),
          runNavigation
        })
      )
    }
    return applyAutomationRunsViewerAction(action.action).then((runsForm) => ({
      ...automationViewerSnapshot(getPage()),
      runsForm
    }))
  }
  if (isAutomationRunsViewerBusy()) {
    throw new Error('viewer_busy')
  }
  if (action.kind === 'row-form') {
    if (rootBusy || isAutomationDeleteViewerBusy()) {
      throw new Error('viewer_busy')
    }
    return applyAutomationRowViewerAction(action.action).then((rowForm) => ({
      ...automationViewerSnapshot(getPage()),
      rowForm
    }))
  }
  if (isAutomationRowViewerBusy()) {
    throw new Error('viewer_busy')
  }
  if (action.kind === 'delete-form') {
    if (rootBusy) {
      throw new Error('viewer_busy')
    }
    if (local.createOpen) {
      throw new Error('viewer_modal_open')
    }
    return applyAutomationDeleteViewerAction(action.action).then((deletion) => ({
      ...automationViewerSnapshot(getPage()),
      deletion
    }))
  }
  if (isAutomationDeleteViewerBusy()) {
    throw new Error('viewer_busy')
  }
  if (action.kind === 'editor-form') {
    if (rootBusy) {
      throw new Error('viewer_busy')
    }
    if (!local.createOpen || local.deleteTarget || local.externalDeleteTarget) {
      throw new Error('viewer_unavailable')
    }
    return applyAutomationEditorViewerAction(action.action).then((editorForm) => ({
      ...automationViewerSnapshot(getPage()),
      editorForm
    }))
  }
  return null
}
