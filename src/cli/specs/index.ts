import { PROJECT_FILTER_COMMAND_SPECS } from './project-filter'
import { SETTINGS_COMMAND_SPECS } from './settings'
import { TCC_THRESHOLD_OBSERVE_COMMAND_SPECS } from './tcc-threshold-observe'
import { CODEX_ACCOUNT_OBSERVE_COMMAND_SPECS } from './codex-account-observe'
import { ACCOUNT_MOUNTED_VIEWER_COMMAND_SPECS } from './account-mounted-viewer'
import { ANTIGRAVITY_ACCOUNT_COMMAND_SPECS } from './antigravity-accounts'
import { ACCOUNT_PREFERENCE_COMMAND_SPECS } from './account-preference'
import { RESOURCE_MANAGER_COMMAND_SPECS } from './resource-manager'
import { AGENT_PERMISSION_MODE_COMMAND_SPECS } from './agent-permission-mode'
import { ACCOUNT_INSPECTION_COMMAND_SPECS } from './account-inspection'
import { PROFILE_AUTH_COMMAND_SPECS } from './profile-auth'
import { ACCOUNT_SECRET_SETTING_COMMAND_SPECS } from './account-secret-settings'
import { ACCOUNT_VIEWER_COMMAND_SPECS } from './account-viewer'
import { ACCOUNT_CREDENTIAL_COMMAND_SPECS } from './account-credentials'
import { ACCOUNT_LOGIN_COMMAND_SPECS } from './account-login'
import { OS_PERMISSION_COMMAND_SPECS } from './os-permissions'
import { USAGE_COMMAND_SPECS, RATE_LIMIT_COMMAND_SPECS } from './usage'
import { SKILL_LIFECYCLE_COMMAND_SPECS } from './skills-lifecycle'
import { SKILL_CLOUD_COMMAND_SPECS } from './skills-cloud'
import { MANAGED_PROFILE_COMMAND_SPECS } from './profiles-managed'
import { SPARSE_PRESET_COMMAND_SPECS } from './sparse-presets'
import { AUTOMATION_EXTENSION_COMMAND_SPECS } from './automation-extensions'
import { MANAGED_SKILL_COMMAND_SPECS } from './skills-managed'
import { PLUGIN_MANAGEMENT_COMMAND_SPECS } from './plugins-management'
import { PLUGIN_COMMAND_SPECS } from './plugins'
import { APP_LIFECYCLE_COMMAND_SPECS } from './app-lifecycle'
import { SEARCH_CONSENT_COMMAND_SPECS } from './search-consent'
import { SEARCH_SETTINGS_VIEWER_COMMAND_SPECS } from './search-settings-viewer'
import { BROWSER_DOCUMENT_COMMAND_SPECS } from './browser-document'
import { BROWSER_SETTINGS_VIEWER_SPECS } from './browser-settings-viewer'
import { FLOATING_BROWSER_VIEWER_SPECS } from './floating-browser-viewer'
import { LINKED_BROWSER_VIEWER_SPECS } from './linked-browser-viewer'
import { BROWSER_PALETTE_COMMAND_SPECS } from './browser-palette'
import { PLUGIN_MARKETPLACE_VIEWER_SPECS } from './plugin-marketplace-viewer'
import { WORKSPACE_PORT_OPEN_COMMAND_SPECS } from './workspace-port-open'
import { WORKSPACE_FILE_OPEN_COMMAND_SPECS } from './workspace-file-open'
import { BROWSER_FAILURE_COMMAND_SPECS } from './browser-failure'
import { BROWSER_WEBAUTHN_DIALOG_COMMAND_SPECS } from './browser-webauthn-dialog'
import { BROWSER_SSH_ROUTE_COMMAND_SPECS } from './browser-ssh-route'
import { COMPUTER_PERMISSIONS_VIEWER_SPECS } from './computer-permissions-viewer'
import { BROWSER_OBSERVATION_COMMAND_SPECS } from './browser-observation'
import { BROWSER_FEATURE_WALL_SPECS } from './browser-feature-wall'
import { BROWSER_TAKE_BACK_COMMAND_SPECS } from './browser-take-back'
import { BROWSER_CLIENT_MARKUP_COMMAND_SPECS } from './browser-client-markup'
import { CLIENT_HOSTED_BROWSER_ROW_COMMAND_SPECS } from './client-hosted-browser-row'
import { BROWSER_SETUP_GUIDE_SPECS } from './browser-setup-guide'
import { BROWSER_READER_COMMAND_SPECS } from './browser-readers'
import { BROWSER_OVERLAY_FOCUS_COMMAND_SPECS } from './browser-overlay-focus'
import { CONNECTIONS_VIEWER_COMMAND_SPECS } from './connections-viewer'
import { SSH_COMMAND_SPECS } from './ssh'
import { ENVIRONMENT_CONNECTION_COMMAND_SPECS } from './environment-connections'
import { MOBILE_CONNECTION_COMMAND_SPECS } from './mobile-connections'
import { NETWORK_CONNECTION_COMMAND_SPECS } from './network-connections'
import { MOBILE_NETWORK_HUMAN_COMMAND_SPECS } from './mobile-network-human-actions'
import type { CommandSpec } from '../args'
import { BROWSER_SESSION_COMMAND_SPECS } from './browser-session'
import { BROWSER_VIEWER_COMMAND_SPECS } from './browser-viewer'
import { BROWSER_TAB_UI_COMMAND_SPECS } from './browser-tab-ui'
import { BROWSER_MARKUP_GESTURE_COMMAND_SPECS } from './browser-markup-gesture'
import { BROWSER_GROUP_UI_COMMAND_SPECS } from './browser-group-ui'
import { ACCOUNT_COMMAND_SPECS } from './account'
import { BROWSER_ADVANCED_COMMAND_SPECS } from './browser-advanced'
import { BROWSER_BASIC_COMMAND_SPECS } from './browser-basic'
import { AUTOMATION_COMMAND_SPECS } from './automations'
import { CORE_COMMAND_SPECS } from './core'
import { FILE_COMMAND_SPECS } from './file'
import { PROJECT_COMMAND_SPECS } from './project'
import { ORCHESTRATION_COMMAND_SPECS } from './orchestration'
import { COMPUTER_COMMAND_SPECS } from './computer'
import { ENVIRONMENT_COMMAND_SPECS } from './environment'
import { AGENT_HOOK_COMMAND_SPECS } from './agent-hooks'
import { DIAGNOSTICS_COMMAND_SPECS } from './diagnostics'
import { BROWSER_REMOTE_PANE_COMMAND_SPECS } from './browser-remote-pane'
import { REMOTE_FILE_PICKER_COMMAND_SPECS } from './remote-file-picker'
import { EMULATOR_COMMAND_SPECS } from './emulator'
import { INTROSPECTION_COMMAND_SPECS } from './introspection'
import { LINEAR_COMMAND_SPECS } from './linear'
import { VM_COMMAND_SPECS } from './vm'
import { SPEECH_COMMAND_SPECS } from './speech'
import { SPEECH_TRANSCRIPTION_COMMAND_SPECS } from './speech-transcription'
import { VM_LIFECYCLE_COMMAND_SPECS } from './vm-lifecycle'
import { VOICE_VIEWER_COMMAND_SPECS } from './voice-viewer'
import { SKILL_COMMAND_SPECS } from './skills'
import { ARTIFACT_COMMAND_SPECS } from './artifacts'
import { SEARCH_COMMAND_SPECS } from './search'
import { PROFILE_STATE_COMMAND_SPECS } from './profile-state'

export const COMMAND_SPECS: CommandSpec[] = [
  ...PROJECT_FILTER_COMMAND_SPECS,
  ...SETTINGS_COMMAND_SPECS,
  ...TCC_THRESHOLD_OBSERVE_COMMAND_SPECS,
  ...CODEX_ACCOUNT_OBSERVE_COMMAND_SPECS,
  ...ACCOUNT_MOUNTED_VIEWER_COMMAND_SPECS,
  ...ANTIGRAVITY_ACCOUNT_COMMAND_SPECS,
  ...ACCOUNT_PREFERENCE_COMMAND_SPECS,
  ...RESOURCE_MANAGER_COMMAND_SPECS,
  ...AGENT_PERMISSION_MODE_COMMAND_SPECS,
  ...ACCOUNT_INSPECTION_COMMAND_SPECS,
  ...PROFILE_AUTH_COMMAND_SPECS,
  ...ACCOUNT_SECRET_SETTING_COMMAND_SPECS,
  ...ACCOUNT_VIEWER_COMMAND_SPECS,
  ...ACCOUNT_CREDENTIAL_COMMAND_SPECS,
  ...ACCOUNT_LOGIN_COMMAND_SPECS,
  ...OS_PERMISSION_COMMAND_SPECS,
  ...MANAGED_PROFILE_COMMAND_SPECS,
  ...SPARSE_PRESET_COMMAND_SPECS,
  ...AUTOMATION_EXTENSION_COMMAND_SPECS,
  ...MANAGED_SKILL_COMMAND_SPECS,
  ...SKILL_LIFECYCLE_COMMAND_SPECS,
  ...SKILL_CLOUD_COMMAND_SPECS,
  ...PLUGIN_MANAGEMENT_COMMAND_SPECS,
  ...PLUGIN_COMMAND_SPECS,
  ...APP_LIFECYCLE_COMMAND_SPECS,
  ...SEARCH_CONSENT_COMMAND_SPECS,
  ...SEARCH_SETTINGS_VIEWER_COMMAND_SPECS,
  ...BROWSER_DOCUMENT_COMMAND_SPECS,
  ...BROWSER_SETTINGS_VIEWER_SPECS,
  ...FLOATING_BROWSER_VIEWER_SPECS,
  ...LINKED_BROWSER_VIEWER_SPECS,
  ...BROWSER_PALETTE_COMMAND_SPECS,
  ...WORKSPACE_PORT_OPEN_COMMAND_SPECS,
  ...WORKSPACE_FILE_OPEN_COMMAND_SPECS,
  ...BROWSER_FAILURE_COMMAND_SPECS,
  ...BROWSER_WEBAUTHN_DIALOG_COMMAND_SPECS,
  ...BROWSER_SSH_ROUTE_COMMAND_SPECS,
  ...COMPUTER_PERMISSIONS_VIEWER_SPECS,
  ...BROWSER_OBSERVATION_COMMAND_SPECS,
  ...BROWSER_FEATURE_WALL_SPECS,
  ...BROWSER_TAKE_BACK_COMMAND_SPECS,
  ...CLIENT_HOSTED_BROWSER_ROW_COMMAND_SPECS,
  ...BROWSER_SETUP_GUIDE_SPECS,
  ...BROWSER_READER_COMMAND_SPECS,
  ...BROWSER_OVERLAY_FOCUS_COMMAND_SPECS,
  ...CONNECTIONS_VIEWER_COMMAND_SPECS,
  ...SSH_COMMAND_SPECS,
  ...ENVIRONMENT_CONNECTION_COMMAND_SPECS,
  ...MOBILE_CONNECTION_COMMAND_SPECS,
  ...NETWORK_CONNECTION_COMMAND_SPECS,
  ...MOBILE_NETWORK_HUMAN_COMMAND_SPECS,

  ...CORE_COMMAND_SPECS,
  ...ARTIFACT_COMMAND_SPECS,
  ...ACCOUNT_COMMAND_SPECS,
  ...USAGE_COMMAND_SPECS,
  ...RATE_LIMIT_COMMAND_SPECS,
  ...PROJECT_COMMAND_SPECS,
  ...FILE_COMMAND_SPECS,
  ...AUTOMATION_COMMAND_SPECS,
  ...BROWSER_BASIC_COMMAND_SPECS,
  ...BROWSER_SESSION_COMMAND_SPECS,
  ...BROWSER_VIEWER_COMMAND_SPECS,
  ...BROWSER_TAB_UI_COMMAND_SPECS,
  ...BROWSER_MARKUP_GESTURE_COMMAND_SPECS,
  ...BROWSER_GROUP_UI_COMMAND_SPECS,
  ...PLUGIN_MARKETPLACE_VIEWER_SPECS,
  ...BROWSER_CLIENT_MARKUP_COMMAND_SPECS,
  ...BROWSER_ADVANCED_COMMAND_SPECS,
  ...ORCHESTRATION_COMMAND_SPECS,
  ...COMPUTER_COMMAND_SPECS,
  ...AGENT_HOOK_COMMAND_SPECS,
  ...DIAGNOSTICS_COMMAND_SPECS,
  ...INTROSPECTION_COMMAND_SPECS,
  ...ENVIRONMENT_COMMAND_SPECS,
  ...LINEAR_COMMAND_SPECS,
  ...VM_COMMAND_SPECS,
  ...SPEECH_COMMAND_SPECS,
  ...SPEECH_TRANSCRIPTION_COMMAND_SPECS,
  ...VM_LIFECYCLE_COMMAND_SPECS,
  ...VOICE_VIEWER_COMMAND_SPECS,
  ...BROWSER_REMOTE_PANE_COMMAND_SPECS,
  ...REMOTE_FILE_PICKER_COMMAND_SPECS,
  ...EMULATOR_COMMAND_SPECS,
  ...SKILL_COMMAND_SPECS,
  ...SEARCH_COMMAND_SPECS,
  ...PROFILE_STATE_COMMAND_SPECS
]
