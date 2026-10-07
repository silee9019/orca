import { refreshMountedUsageAccount } from './use-usage-account-refresh-controller'
import { applyUsageRosterSignIn } from './usage-roster-viewer-controller'
import {
  startInlineUsageSignIn,
  readInlineUsageSignIn,
  cancelInlineUsageSignIn
} from './usage-inline-signin-controller'
import {
  startFeatureWallUsageSignIn,
  readFeatureWallUsageSignIn,
  cancelFeatureWallUsageSignIn,
  refreshUsageAccountStateViaViewer
} from './usage-account-viewer-controller'
import { openUsagePercentageSettings } from './usage-percentage-settings-navigation'
import {
  applyUsageViewerProviderAction,
  refreshUsageViewerOverview
} from './usage-viewer-provider-actions'
import { applySkillExampleViewerAction } from './skill-example-viewer-controller'
import { setNativeContextViewerOpen } from './native-context-viewer-controller'
import { closeUsageMenuIfMounted, setUsageMenuOpenViaViewer } from './usage-menu-controller'
import { UsageViewerActionSchema } from '../../../shared/rpc-contract/usage-params'
import { useAppStore } from '../store'
import { applyUsageShareAction } from './usage-share-actions'
import { useUsageTabSelection } from './usage-tab-selection'
import { applyUsageViewerFilters } from './usage-viewer-filters'

export async function applyUsageViewerAction(input: unknown): Promise<unknown> {
  const action = UsageViewerActionSchema.parse(input)
  switch (action.action) {
    case 'refresh-account-usage':
      return refreshMountedUsageAccount(action.provider)
    case 'roster-signin':
      return applyUsageRosterSignIn(action.provider)
    case 'inline-signin':
      return startInlineUsageSignIn(action)
    case 'inline-signin-status':
      return readInlineUsageSignIn(action.operationId)
    case 'inline-signin-cancel':
      return cancelInlineUsageSignIn(action.operationId)
    case 'feature-wall-signin':
      return startFeatureWallUsageSignIn(action.provider)
    case 'feature-wall-signin-status':
      return readFeatureWallUsageSignIn(action.provider, action.operationId)
    case 'feature-wall-signin-cancel':
      return cancelFeatureWallUsageSignIn(action.provider, action.operationId)
    case 'refresh-account-state':
      return refreshUsageAccountStateViaViewer()
    case 'open-percentage-settings': {
      useAppStore.getState().dismissUsagePercentageDisplayChangeNotice()
      openUsagePercentageSettings()
      const state = useAppStore.getState()
      return {
        pane: state.settingsNavigationTarget?.pane,
        sectionId: state.settingsNavigationTarget?.sectionId,
        noticeDismissed: state.usagePercentageDisplayChangeNoticeDismissed
      }
    }
    case 'set-enabled':
      return applyUsageViewerProviderAction(action.provider, action.enabled)
    case 'refresh-provider':
      return action.provider === 'overview'
        ? refreshUsageViewerOverview()
        : applyUsageViewerProviderAction(action.provider)
    case 'record-interaction': {
      if (!useAppStore.getState().persistedUIReady) {
        throw new Error('usage_viewer_not_ready')
      }
      await useAppStore.getState().recordFeatureInteraction('usage-tracking')
      const interaction = useAppStore.getState().featureInteractions['usage-tracking']
      if (!interaction) {
        throw new Error('usage_interaction_not_applied')
      }
      return { featureId: 'usage-tracking', interaction }
    }
    case 'skill-example':
      return applySkillExampleViewerAction(action.skillCommand, action.exampleId, action.operation)
    case 'set-context-open':
      return setNativeContextViewerOpen(action.target, action.open)
    case 'dismiss-notice': {
      if (action.notice === 'empty-usage') {
        useAppStore.getState().dismissUsageEmptyState()
        return {
          notice: action.notice,
          dismissed: useAppStore.getState().usageEmptyStateDismissed,
          applied: 'viewer'
        }
      }
      useAppStore.getState().dismissUsagePercentageDisplayChangeNotice()
      return {
        notice: action.notice,
        dismissed: useAppStore.getState().usagePercentageDisplayChangeNoticeDismissed,
        applied: 'viewer'
      }
    }
    case 'set-menu-open':
      return setUsageMenuOpenViaViewer(action.open, action.focusPolicy === 'retain-current')
    case 'share':
      return applyUsageShareAction(action.provider, action.operation)
    case 'select-tab': {
      await closeUsageMenuIfMounted()
      useUsageTabSelection.getState().setActiveUsageTab(action.tab)
      useAppStore.getState().openSettingsTarget({ pane: 'stats', repoId: null })
      useAppStore.getState().openSettingsPage()
      return { tab: useUsageTabSelection.getState().activeUsageTab }
    }
    case 'set-filters': {
      const { provider, scope, range } = action
      return applyUsageViewerFilters({ provider, scope, range }, useAppStore.getState)
    }
    case 'set-display-mode': {
      useAppStore.getState().setStatusBarUsageMode(action.mode)
      return { mode: useAppStore.getState().statusBarUsageMode, applied: 'viewer' }
    }
  }
}
