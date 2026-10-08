import { getAutomationTemplates } from '../components/automations/automation-templates'
import {
  applyAutomationViewerChildAction,
  isAutomationViewerChildAction
} from './automation-page-viewer-child-action'
import {
  isAutomationSettingsHandoff,
  startAutomationViewerSettingsHandoff,
  releaseAutomationViewerRequest
} from './automation-viewer-settings-handoff'
import {
  automationViewerRecoveryTarget,
  performAutomationViewerAsyncAction
} from './automation-page-viewer-async'
import {
  didAutomationViewerTargetChange,
  automationViewerHostScope,
  type AutomationViewerRequest
} from './automation-page-viewer-commit'
import {
  automationViewerSnapshot as snapshot,
  type AutomationViewerPage as Page,
  type AutomationViewerState as ViewerState
} from './automation-page-viewer-state'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AutomationViewerAction } from '../../../shared/automation-viewer-command'
import { AutomationViewerActionSchema } from '../../../shared/automation-viewer-command'
import {
  EMPTY_AUTOMATION_LIST_FILTER,
  nextAutomationListSort
} from '../components/automations/automation-list-view'

type PageAction = Exclude<AutomationViewerAction, { kind: 'workspace-provenance-form' }>
type Control = (action: PageAction) => Promise<ViewerState>
const mountedViewers = new Set<Control>()

export async function applyAutomationViewerAction(
  action: AutomationViewerAction
): Promise<ViewerState> {
  const parsed = AutomationViewerActionSchema.parse(action)
  if (parsed.kind === 'workspace-provenance-form') {
    throw new Error('workspace_automation_requires_routed_viewer')
  }
  if (mountedViewers.size !== 1) {
    throw new Error(mountedViewers.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mountedViewers.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control(parsed)
}

export function useAutomationViewerController(page: Page): void {
  const latest = useRef(page)
  const [, setRevision] = useState(0)
  useLayoutEffect(() => {
    latest.current = page
  })
  const pending = useRef<AutomationViewerRequest | null>(null)
  useEffect(() => {
    const request = pending.current
    if (!request || !request.ready || !page.list.searchSettled) {
      return
    }
    const state = snapshot(page)
    if (
      page.list.searchCounts.searchActive &&
      state.visibleRowKeys.length > 0 &&
      !state.visibleRowKeys.includes(state.selectedExternalKey ?? state.selectedRowKey ?? '')
    ) {
      return
    }
    pending.current = null
    const action = request.action
    if (
      didAutomationViewerTargetChange(page, action, state) ||
      ((action.kind === 'refresh' || action.kind === 'host-recover') &&
        request.hostScope !== automationViewerHostScope(page))
    ) {
      request.reject(new Error('viewer_target_changed'))
    } else {
      request.resolve({ ...state, ...request.outcome })
    }
  })
  useEffect(() => {
    const control: Control = async (action) => {
      const { local, list, listNavigation, editorActions, destination } = latest.current
      if (action.kind === 'get') {
        return snapshot(latest.current)
      }
      const child = applyAutomationViewerChildAction(
        () => latest.current,
        action,
        Boolean(pending.current)
      )
      if (isAutomationViewerChildAction(action)) {
        if (!child) {
          throw new Error('viewer_unavailable')
        }
        return child
      }
      if (local.createOpen || local.deleteTarget || local.externalDeleteTarget) {
        throw new Error('viewer_modal_open')
      }
      if (pending.current) {
        throw new Error('viewer_busy')
      }
      if (action.kind === 'list-navigation' && !listNavigation.current) {
        throw new Error('viewer_unavailable')
      }
      if (action.kind === 'editor-create' && !destination.canCreateAutomation) {
        throw new Error('automation_create_unavailable')
      }
      if (
        action.kind === 'host-select' &&
        action.stableKey !== null &&
        !list.hostCatalog.entries.some((entry) => entry.stableKey === action.stableKey)
      ) {
        throw new Error('automation_host_not_loaded')
      }
      if (
        action.kind === 'filter' &&
        action.value.hostStableKeys?.some(
          (key) => !list.hostCatalog.entries.some((entry) => entry.stableKey === key)
        )
      ) {
        throw new Error('automation_host_not_loaded')
      }
      if (
        (action.kind === 'select' || action.kind === 'editor-edit') &&
        !(action.source === 'local'
          ? list.filteredRows.some((row) => row.key === action.rowKey)
          : list.filteredExternalAutomationEntries.some((entry) => entry.key === action.rowKey))
      ) {
        throw new Error('automation_row_not_visible')
      }
      const editRow =
        action.kind === 'editor-edit' && action.source === 'local'
          ? list.filteredRows.find((row) => row.key === action.rowKey)
          : null
      if (editRow && !destination.isAutomationRowActionEnabled(editRow, 'edit')) {
        throw new Error('automation_edit_unavailable')
      }
      const editExternal =
        action.kind === 'editor-edit' && action.source === 'external'
          ? list.filteredExternalAutomationEntries.find((entry) => entry.key === action.rowKey)
          : null
      if (
        editExternal &&
        (editExternal.manager.provider !== 'hermes' ||
          !editExternal.manager.canManage ||
          local.externalActionKey !== null)
      ) {
        throw new Error('automation_edit_unavailable')
      }
      const template =
        action.kind === 'editor-create' && action.templateId
          ? getAutomationTemplates().find((entry) => entry.id === action.templateId)
          : undefined
      if (action.kind === 'editor-create' && action.templateId && !template) {
        throw new Error('automation_template_unavailable')
      }
      if (action.kind === 'host-recover') {
        automationViewerRecoveryTarget(latest.current, action)
        if (isAutomationSettingsHandoff(action)) {
          return startAutomationViewerSettingsHandoff(latest.current, action, pending)
        }
      }
      return new Promise((resolve, reject) => {
        const request: AutomationViewerRequest = {
          action,
          resolve,
          reject,
          ready: !['editor-edit', 'refresh', 'host-recover'].includes(action.kind),
          hostScope:
            action.kind === 'refresh' || action.kind === 'host-recover'
              ? automationViewerHostScope(latest.current)
              : undefined
        }
        pending.current = request
        switch (action.kind) {
          case 'host-select': {
            const entry = list.hostCatalog.entries.find(
              (host) => host.stableKey === action.stableKey
            )
            list.hostCatalog.selectHost(
              entry ? { kind: 'host', host: entry.stableRef } : { kind: 'all' }
            )
            break
          }
          case 'editor-create':
            if (template) {
              editorActions.openCreateDialog(template)
            } else {
              editorActions.openCreateDialog()
            }
            break
          case 'refresh':
          case 'host-recover':
          case 'editor-edit': {
            void performAutomationViewerAsyncAction(latest.current, action).then(
              (result) => {
                if (pending.current !== request) {
                  return
                }
                request.outcome = result
                request.ready = true
                setRevision((value) => value + 1)
              },
              (error: unknown) => {
                if (pending.current !== request) {
                  return
                }
                pending.current = null
                reject(error instanceof Error ? error : new Error('automation_editor_open_failed'))
              }
            )
            break
          }
          case 'list-navigation':
            if (action.action === 'activate') {
              listNavigation.current?.activate()
            } else {
              listNavigation.current?.move(action.action === 'next' ? 'ArrowDown' : 'ArrowUp')
            }
            break
          case 'navigate':
            if (action.value === 'list') {
              local.showAutomationsList()
            } else if (action.value === 'runs') {
              local.showRunsDashboard()
            } else {
              local.showAutomationDetails()
            }
            break
          case 'query':
            local.setListSearchQuery(action.value)
            break
          case 'filter':
            list.changeListFilter(action.value)
            break
          case 'filter-clear':
            list.changeListFilter(EMPTY_AUTOMATION_LIST_FILTER)
            list.hostCatalog.selectHost({ kind: 'all' })
            break
          case 'sort':
            local.setListSort(action.value)
            break
          case 'sort-next':
            local.setListSort(nextAutomationListSort(local.listSort, action.field))
            break
          case 'select':
            list.selectAutomationRow(action.source === 'local' ? action.rowKey : null)
            local.selectExternalKey(action.source === 'external' ? action.rowKey : null)
            if (action.source === 'external') {
              local.setActivePaneTab('overview')
            }
            local.setIsDetailOpen(true)
            break
          case 'detail':
            local.setIsDetailOpen(action.open)
            break
          case 'tab':
            local.setActivePaneTab(action.value)
            break
          case 'view':
            if (action.value === 'runs') {
              list.hostCatalog.selectHost({ kind: 'all' })
            }
            local.setPageView(action.value)
            break
        }
        setRevision((value) => value + 1)
      })
    }
    mountedViewers.add(control)
    return () => {
      mountedViewers.delete(control)
      releaseAutomationViewerRequest(pending)
    }
  }, [])
}
