import { applyPluginMarketplaceViewerAction } from './plugin-marketplace-viewer-controller'
import type { PluginSettingsViewerAction } from '../../../shared/plugin-settings-viewer-command'
import {
  applyPluginConsentViewerAction,
  type PluginConsentViewerState
} from './plugin-consent-viewer-controller'
import {
  applyPluginInstallViewerAction,
  type PluginInstallViewerState
} from './plugin-install-viewer-controller'
import { applyPluginDevelopmentViewerAction } from './plugin-development-viewer-controller'
import type { PluginSettingsViewerPage } from './plugin-settings-viewer-state'

type PluginSettingsFormAction = Extract<
  PluginSettingsViewerAction,
  { kind: 'consent-form' | 'install-form' | 'development-form' | 'marketplace-form' }
>
export type PluginSettingsViewerForms = {
  marketplace?: Awaited<ReturnType<typeof applyPluginMarketplaceViewerAction>>
  consent?: PluginConsentViewerState
  install?: PluginInstallViewerState
  development?: Awaited<ReturnType<typeof applyPluginDevelopmentViewerAction>>
}
export function isPluginSettingsFormAction(
  action: PluginSettingsViewerAction
): action is PluginSettingsFormAction {
  return (
    action.kind === 'consent-form' ||
    action.kind === 'install-form' ||
    action.kind === 'development-form' ||
    action.kind === 'marketplace-form'
  )
}
export async function applyPluginSettingsFormAction(
  action: PluginSettingsFormAction,
  page: PluginSettingsViewerPage
): Promise<PluginSettingsViewerForms> {
  switch (action.kind) {
    case 'marketplace-form':
      if (!page.featureEnabled || page.loading) {
        throw new Error('viewer_unavailable')
      }
      return { marketplace: await applyPluginMarketplaceViewerAction(action.action) }
    case 'consent-form':
      if (!page.consentPluginId) {
        throw new Error('viewer_unavailable')
      }
      return { consent: await applyPluginConsentViewerAction(action.action) }
    case 'install-form':
      if (!page.installOpen) {
        throw new Error('viewer_unavailable')
      }
      return { install: await applyPluginInstallViewerAction(action.action) }
    case 'development-form':
      if (!page.featureEnabled || page.loading) {
        throw new Error('viewer_unavailable')
      }
      return { development: await applyPluginDevelopmentViewerAction(action.action) }
  }
}

export function isPluginSettingsFormRead(action: PluginSettingsFormAction): boolean {
  return (
    action.action.kind === 'get' ||
    (action.kind === 'marketplace-form' &&
      (action.action.kind === 'source-form' || action.action.kind === 'preview-form') &&
      action.action.action.kind === 'get')
  )
}
