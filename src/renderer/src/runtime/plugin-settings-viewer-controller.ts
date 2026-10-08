import { pluginMarketplaceModalOpen } from './plugin-marketplace-viewer-controller'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  PluginSettingsViewerActionSchema,
  type PluginSettingsViewerAction
} from '../../../shared/plugin-settings-viewer-command'
import {
  applyPluginSettingsFormAction,
  isPluginSettingsFormAction,
  isPluginSettingsFormRead,
  type PluginSettingsViewerForms
} from './plugin-settings-form-action'

import {
  snapshot,
  rowCount,
  type PluginSettingsViewerPage as Page
} from './plugin-settings-viewer-state'
export { usePluginSettingsViewerRow } from './plugin-settings-viewer-state'

type ViewerState = ReturnType<typeof snapshot> & PluginSettingsViewerForms
type Control = (action: PluginSettingsViewerAction) => Promise<ViewerState>
type Request = {
  ready: boolean
  logsKey?: string
  form?: PluginSettingsViewerForms
  confirmation?: Extract<PluginSettingsViewerAction, { kind: 'confirm' }>
  resolve: (state: ViewerState) => void
  reject: (error: Error) => void
}
const mountedViewers = new Set<Control>()
export async function applyPluginSettingsViewerAction(
  action: PluginSettingsViewerAction
): Promise<ViewerState> {
  const parsed = PluginSettingsViewerActionSchema.parse(action)
  if (mountedViewers.size !== 1) {
    throw new Error(mountedViewers.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mountedViewers.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control(parsed)
}
export function usePluginSettingsViewerController(page: Page): void {
  const latest = useRef(page)
  useLayoutEffect(() => {
    latest.current = page
  })
  const [, setRevision] = useState(0)
  const pending = useRef<Request | null>(null)
  useEffect(() => {
    const request = pending.current
    if (!request?.ready || (request.logsKey && page.logsByPlugin[request.logsKey]?.loading)) {
      return
    }
    pending.current = null
    const confirmationId =
      request.confirmation?.dialog === 'remove' ? page.removePluginId : page.rollbackPluginId
    if ((request.form?.install?.accepted || request.form?.install?.closed) && page.installOpen) {
      request.reject(new Error('plugin_install_dialog_changed'))
    } else if (request.confirmation && confirmationId !== null) {
      request.reject(new Error('plugin_confirmation_changed'))
    } else if (request.form?.consent?.accepted && page.consentPluginId !== null) {
      request.reject(new Error('plugin_consent_dialog_changed'))
    } else if (
      request.logsKey &&
      (!page.openLogs.has(request.logsKey) ||
        page.logsByPlugin[request.logsKey]?.error ||
        !page.logsByPlugin[request.logsKey]?.lines)
    ) {
      request.reject(new Error('plugin_logs_failed'))
    } else {
      request.resolve({
        ...snapshot(page),
        ...request.form
      })
    }
  })
  useEffect(() => {
    if (!page.mounted) {
      return
    }
    const control: Control = async (action) => {
      const current = latest.current
      if (action.kind === 'get') {
        return snapshot(current)
      }
      if (isPluginSettingsFormAction(action) && isPluginSettingsFormRead(action)) {
        return { ...snapshot(current), ...(await applyPluginSettingsFormAction(action, current)) }
      }
      if (action.kind !== 'marketplace-form' && pluginMarketplaceModalOpen()) {
        throw new Error('viewer_modal_open')
      }
      if (pending.current || current.settingsBusy || current.busyPluginKeys.size) {
        throw new Error('viewer_busy')
      }
      if (action.kind === 'cancel' || action.kind === 'confirm') {
        const selected =
          action.dialog === 'remove' ? current.removePluginId : current.rollbackPluginId
        if (selected !== action.pluginKey) {
          throw new Error('plugin_confirmation_changed')
        }
      } else if (
        (current.installOpen && action.kind !== 'install-form') ||
        (current.consentPluginId && action.kind !== 'consent-form') ||
        current.removePluginId ||
        current.rollbackPluginId
      ) {
        throw new Error('viewer_modal_open')
      }
      const modalAction =
        action.kind === 'consent-form' ||
        action.kind === 'install-form' ||
        action.kind === 'confirm' ||
        action.kind === 'cancel'
      if (!current.featureEnabled && !modalAction) {
        throw new Error('plugin_system_disabled')
      }
      if (current.loading && action.kind !== 'open' && !modalAction) {
        throw new Error('viewer_busy')
      }
      const plugin =
        'pluginKey' in action
          ? current.plugins.find((entry) => entry.pluginKey === action.pluginKey)
          : undefined
      if ('pluginKey' in action) {
        if (!plugin) {
          throw new Error('plugin_not_loaded')
        }
        const count = rowCount(plugin.pluginKey)
        if (!modalAction && (count !== 1 || current.error)) {
          throw new Error(count > 1 ? 'viewer_ambiguous' : 'plugin_not_visible')
        }
        if (action.kind === 'confirm' && plugin) {
          if (plugin.version !== action.version) {
            throw new Error('plugin_confirmation_changed')
          }
          if (action.dialog === 'remove' && (plugin.isDev || plugin.bundled)) {
            throw new Error('plugin_remove_protected')
          }
          if (action.dialog === 'rollback' && plugin.source?.kind !== 'marketplace') {
            throw new Error('plugin_rollback_unavailable')
          }
        }
      }
      if (action.kind === 'toggle-enabled' && plugin) {
        if (plugin.needsReconsent || plugin.status === 'pending') {
          throw new Error('plugin_consent_required')
        }
        if (plugin.status === 'invalid' || plugin.blockedByKillList) {
          throw new Error('plugin_toggle_unavailable')
        }
      }
      if (action.kind === 'open-plugin' && plugin) {
        if (
          action.dialog === 'review' &&
          (!plugin.consentFingerprint || (!plugin.needsReconsent && plugin.status !== 'pending'))
        ) {
          throw new Error('plugin_review_unavailable')
        }
        if (action.dialog === 'remove' && (plugin.isDev || plugin.bundled)) {
          throw new Error('plugin_remove_protected')
        }
        if (action.dialog === 'rollback' && plugin.source?.kind !== 'marketplace') {
          throw new Error('plugin_rollback_unavailable')
        }
      }
      return new Promise((resolve, reject) => {
        const request: Request = {
          ready: false,
          logsKey: action.kind === 'logs' && action.open ? action.pluginKey : undefined,
          confirmation: action.kind === 'confirm' ? action : undefined,
          resolve,
          reject
        }
        pending.current = request
        void (async () => {
          switch (action.kind) {
            case 'install-form':
            case 'consent-form':
            case 'development-form':
            case 'marketplace-form':
              request.form = await applyPluginSettingsFormAction(action, current)
              break
            case 'confirm':
              if (
                !(await (
                  action.dialog === 'remove' ? current.confirmRemove : current.confirmRollback
                )(action.pluginKey))
              ) {
                throw new Error('plugin_confirmation_failed')
              }
              break
            case 'refresh':
              if (!(await current.refresh())) {
                throw new Error('plugin_refresh_failed')
              }
              break
            case 'toggle-enabled':
              if (!plugin || !(await current.toggleEnabled(plugin))) {
                throw new Error('plugin_toggle_failed')
              }
              break
            case 'logs':
              if (current.openLogs.has(action.pluginKey) !== action.open) {
                current.toggleLogs(action.pluginKey)
              }
              break
            case 'open':
              current.openInstall()
              break
            case 'cancel':
              if (action.dialog === 'remove') {
                current.cancelRemove()
              } else {
                current.cancelRollback()
              }
              break
            case 'open-plugin':
              switch (action.dialog) {
                case 'review':
                  current.review(action.pluginKey)
                  break
                case 'remove':
                  current.remove(action.pluginKey)
                  break
                case 'rollback':
                  current.rollback(action.pluginKey)
                  break
              }
              break
          }
        })().then(
          () => {
            if (pending.current !== request) {
              return
            }
            request.ready = true
            setRevision((value) => value + 1)
          },
          (error: unknown) => {
            if (pending.current !== request) {
              return
            }
            pending.current = null
            reject(error instanceof Error ? error : new Error('plugin_viewer_action_failed'))
          }
        )
      })
    }
    mountedViewers.add(control)
    return () => {
      mountedViewers.delete(control)
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    }
  }, [page.mounted])
}
