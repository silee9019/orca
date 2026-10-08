import { SETTINGS_CONTROL_METHODS } from './settings-control'
import { TCC_THRESHOLD_OBSERVATION_METHODS } from './tcc-threshold-observation'
import { CODEX_LOGIN_OBSERVATION_METHODS } from './codex-login-observation'
import { ACCOUNT_PREFERENCE_METHODS } from './account-preference'
import { RESOURCE_MANAGER_METHODS } from './resource-manager'
import { AGENT_PERMISSION_MODE_METHODS } from './agent-permission-mode'
import { ACCOUNT_INSPECTION_METHODS } from './account-inspection'
import { PROFILE_AUTH_METHODS } from './profile-auth'
import { ACCOUNT_SECRET_SETTING_METHODS } from './account-secret-settings'
import { ACCOUNTS_VIEWER_METHODS } from './accounts-viewer'
import { USAGE_VIEWER_METHODS } from './usage-viewer'
import { ACCOUNT_CREDENTIAL_METHODS } from './account-credentials'
import { ACCOUNT_LOGIN_METHODS } from './account-login'
import { OS_PERMISSION_METHODS } from './os-permissions'
import { USAGE_METHODS } from './usage'
import { RATE_LIMIT_METHODS } from './rate-limits'
import { ORCA_PROFILE_METHODS } from './orca-profiles'
import { SPARSE_PRESET_METHODS } from './sparse-presets'
import { DESKTOP_FEEDBACK_METHODS } from './desktop-feedback'
import { APP_LIFECYCLE_METHODS } from './app-lifecycle'
import { DESKTOP_UPDATER_METHODS } from './desktop-updater'
import { DESKTOP_CLI_METHODS } from './desktop-cli'
import { DESKTOP_SUPPORT_METHODS } from './desktop-support'
import { DESKTOP_DIAGNOSTICS_METHODS } from './desktop-diagnostics'
import { DESKTOP_PET_METHODS } from './desktop-pet'
import { DESKTOP_STAR_PROMPT_METHODS } from './desktop-star-prompt'
import { DESKTOP_SHELL_METHODS } from './desktop-shell'
import { APP_VAULT_METHODS } from './app-vault'
import { BROWSER_PROFILE_FILE_METHODS } from './browser-profile-file'
import { BROWSER_VIEWER_METHODS } from './browser-viewer'
import { SEARCH_SETTINGS_VIEWER_METHODS } from './search-settings-viewer'
import { browserReaderMethods } from './browser-readers'
import { CONNECTIONS_VIEWER_METHODS } from './connections-viewer'
import { SSH_MANAGEMENT_METHODS } from './ssh-management'
import { ENVIRONMENT_MANAGEMENT_METHODS } from './environment-management'
import { MOBILE_CONNECTION_METHODS } from './mobile-connections'
import { NETWORK_CONNECTION_METHODS } from './network-connections'
import { MOBILE_NETWORK_HUMAN_METHODS } from './mobile-network-human-actions'
import { TERMINAL_SIDE_EFFECT_SNAPSHOT_METHODS } from './terminal-side-effect-snapshot'
import { TERMINAL_HOST_INVENTORY_METHODS } from './terminal-host-inventory'
import { DAEMON_MANAGEMENT_METHODS } from './daemon-management'
import { AGENT_STATUS_CLI_METHODS } from './agent-status-cli'
import { AI_VAULT_SESSION_ACTION_METHODS } from './ai-vault-session-actions'
import { WORKSPACE_JIRA_PROJECT_USER_METHODS } from './workspace-jira-project-users'
import { WORKSPACE_LINEAR_ISSUE_FIELD_METHODS } from './workspace-linear-issue-fields'
import { WORKSPACE_GITHUB_ACCOUNT_METHODS } from './workspace-github-account'
import { WORKSPACE_GITLAB_INSPECTION_METHODS } from './workspace-gitlab-inspection'
import { WORKSPACE_KEYBINDING_FILE_METHODS } from './workspace-keybinding-file'
import { WORKSPACE_GIT_IGNORE_METHODS } from './workspace-git-ignore'
import { WORKSPACE_BITBUCKET_METHODS } from './workspace-bitbucket'
import { SETTINGS_VIEWER_METHODS } from './settings-viewer'
import { SIDEBAR_VIEWER_METHODS } from './sidebar-viewer'
import { CARD_VIEWER_METHODS } from './card-viewer'
import { STATUS_BAR_VIEWER_METHODS } from './status-bar-viewer'
import { WORKSPACE_LIST_VIEWER_METHODS } from './workspace-list-viewer'
import { WORKSPACE_FILTER_METHODS } from './workspace-filter'
import { STATUS_METHODS } from './status'
import { AI_VAULT_METHODS } from './ai-vault'
import { AUTOMATION_METHODS } from './automations'
import { REPO_METHODS } from './repo'
import { WORKTREE_METHODS } from './worktree'
import { TERMINAL_METHODS } from './terminal'
import { TERMINAL_ORPHAN_METHODS } from './terminal-orphan'
import { BROWSER_CORE_METHODS } from './browser-core'
import { BROWSER_IDENTITY_METHODS } from './browser-identity-rpc'
import { BROWSER_EXTRA_METHODS } from './browser-extras'
import { BROWSER_SCREENCAST_METHODS } from './browser-screencast'
import { BROWSER_CLIENT_HOST_METHODS } from './browser-client-host'
import { BROWSER_CLIENT_FILE_CHANNEL_METHODS } from './browser-client-file-channel'
import { BROWSER_NETWORK_TUNNEL_METHODS } from './browser-network-tunnel'
import { ORCHESTRATION_METHODS } from './orchestration'
import { NOTIFICATION_METHODS } from './notifications'
import { STATS_METHODS } from './stats'
import { DIAGNOSTICS_METHODS } from './diagnostics'
import { ACCOUNT_METHODS } from './accounts'
import { ANTIGRAVITY_ACCOUNT_METHODS } from './antigravity-accounts'
import { PREFLIGHT_METHODS } from './preflight'
import { COMPUTER_METHODS } from './computer'
import { SESSION_TAB_METHODS } from './session-tabs'
import { NATIVE_CHAT_METHODS } from './native-chat'
import { FILE_METHODS } from './files'
import { GIT_METHODS } from './git'
import { GITHUB_METHODS } from './github'
import { GITLAB_METHODS } from './gitlab'
import { HOSTED_REVIEW_METHODS } from './hosted-review'
import { LINEAR_METHODS } from './linear'
import { LINEAR_AGENT_ACCESS_METHODS } from './linear-agent-access'
import { JIRA_METHODS } from './jira'
import { SSH_METHODS } from './ssh'
import { SPEECH_METHODS } from './speech'
import { SPEECH_CONTROL_METHODS } from './speech-control'
import { SPEECH_TRANSCRIPTION_METHODS } from './speech-transcription'
import { EPHEMERAL_VM_METHODS } from './ephemeral-vm'
import { VOICE_VIEWER_METHODS } from './voice-viewer'
import { CLIENT_UI_METHODS } from './client-ui'
import { CLIENT_EVENT_METHODS } from './client-events'
import { WORKSPACE_PORT_METHODS } from './workspace-ports'
import { PLUGIN_METHODS } from './plugins'
import { SKILL_METHODS } from './skills'
import { CLIPBOARD_METHODS } from './clipboard'
import { HOST_CAPABILITY_METHODS } from './host-capabilities'
import { MOBILE_WEB_BUNDLE_METHODS } from './mobile-web-bundle'
import { RUNTIME_CLIENT_CAPABILITY_METHODS } from './runtime-client-capabilities'
import { EMULATOR_METHODS } from './emulator'
import { PAIRING_METHODS } from './pairing'
import { UPDATER_METHODS } from './updater'
import { AGENT_SESSION_METHODS } from './agent-session'
import { STRUCTURED_AGENT_SESSION_METHODS } from './structured-agent-session'
import { STRUCTURED_AGENT_SESSION_AGENTS_METHODS } from './structured-agent-session-agents'
import { ARTIFACT_METHODS } from './artifacts'
import { AGENT_HOOK_METHODS } from './agent-hooks'
import { AGENT_LAUNCH_METHODS } from './agent-launch'

// Why: a flat manifest keeps registration order explicit and provides one
// grep-point for "what methods does the RPC server expose?" — useful when
// auditing the security boundary or wiring new CLI commands.
export const ALL_RPC_METHODS = [
  ...SETTINGS_CONTROL_METHODS,
  ...RESOURCE_MANAGER_METHODS,
  ...AGENT_PERMISSION_MODE_METHODS,
  ...TCC_THRESHOLD_OBSERVATION_METHODS,
  ...CODEX_LOGIN_OBSERVATION_METHODS,
  ...ACCOUNT_INSPECTION_METHODS,
  ...ACCOUNT_PREFERENCE_METHODS,
  ...PROFILE_AUTH_METHODS,
  ...ACCOUNT_SECRET_SETTING_METHODS,
  ...ACCOUNTS_VIEWER_METHODS,
  ...USAGE_VIEWER_METHODS,
  ...ACCOUNT_CREDENTIAL_METHODS,
  ...ACCOUNT_LOGIN_METHODS,
  ...OS_PERMISSION_METHODS,
  ...ORCA_PROFILE_METHODS,
  ...SPARSE_PRESET_METHODS,
  ...DESKTOP_FEEDBACK_METHODS,
  ...APP_LIFECYCLE_METHODS,
  ...DESKTOP_UPDATER_METHODS,
  ...DESKTOP_CLI_METHODS,
  ...DESKTOP_SUPPORT_METHODS,
  ...DESKTOP_DIAGNOSTICS_METHODS,
  ...DESKTOP_PET_METHODS,
  ...DESKTOP_STAR_PROMPT_METHODS,
  ...DESKTOP_SHELL_METHODS,
  ...APP_VAULT_METHODS,
  ...SEARCH_SETTINGS_VIEWER_METHODS,
  ...browserReaderMethods,
  ...CONNECTIONS_VIEWER_METHODS,
  ...SSH_MANAGEMENT_METHODS,
  ...ENVIRONMENT_MANAGEMENT_METHODS,
  ...MOBILE_CONNECTION_METHODS,
  ...NETWORK_CONNECTION_METHODS,
  ...MOBILE_NETWORK_HUMAN_METHODS,

  ...WORKSPACE_GIT_IGNORE_METHODS,
  ...WORKSPACE_KEYBINDING_FILE_METHODS,
  ...WORKSPACE_LINEAR_ISSUE_FIELD_METHODS,
  ...WORKSPACE_JIRA_PROJECT_USER_METHODS,
  ...WORKSPACE_GITHUB_ACCOUNT_METHODS,
  ...WORKSPACE_GITLAB_INSPECTION_METHODS,
  ...WORKSPACE_BITBUCKET_METHODS,
  ...SETTINGS_VIEWER_METHODS,
  ...SIDEBAR_VIEWER_METHODS,
  ...CARD_VIEWER_METHODS,
  ...STATUS_BAR_VIEWER_METHODS,
  ...WORKSPACE_LIST_VIEWER_METHODS,
  ...WORKSPACE_FILTER_METHODS,
  ...STATUS_METHODS,
  ...AGENT_STATUS_CLI_METHODS,
  ...TERMINAL_HOST_INVENTORY_METHODS,
  ...TERMINAL_SIDE_EFFECT_SNAPSHOT_METHODS,
  ...DAEMON_MANAGEMENT_METHODS,
  ...AGENT_HOOK_METHODS,
  ...AI_VAULT_METHODS,
  ...AI_VAULT_SESSION_ACTION_METHODS,
  ...ARTIFACT_METHODS,
  ...AUTOMATION_METHODS,
  ...REPO_METHODS,
  ...WORKTREE_METHODS,
  ...AGENT_SESSION_METHODS,
  ...STRUCTURED_AGENT_SESSION_METHODS,
  ...STRUCTURED_AGENT_SESSION_AGENTS_METHODS,
  ...AGENT_LAUNCH_METHODS,
  ...TERMINAL_METHODS,
  ...TERMINAL_ORPHAN_METHODS,
  ...BROWSER_CORE_METHODS,
  ...BROWSER_PROFILE_FILE_METHODS,
  ...BROWSER_VIEWER_METHODS,
  ...BROWSER_IDENTITY_METHODS,
  ...BROWSER_SCREENCAST_METHODS,
  ...BROWSER_EXTRA_METHODS,
  ...BROWSER_CLIENT_HOST_METHODS,
  ...BROWSER_CLIENT_FILE_CHANNEL_METHODS,
  ...BROWSER_NETWORK_TUNNEL_METHODS,
  ...ORCHESTRATION_METHODS,
  ...NOTIFICATION_METHODS,
  ...STATS_METHODS,
  ...DIAGNOSTICS_METHODS,
  ...ACCOUNT_METHODS,
  ...USAGE_METHODS,
  ...RATE_LIMIT_METHODS,
  ...ANTIGRAVITY_ACCOUNT_METHODS,
  ...PREFLIGHT_METHODS,
  ...COMPUTER_METHODS,
  ...SESSION_TAB_METHODS,
  ...NATIVE_CHAT_METHODS,
  ...FILE_METHODS,
  ...GIT_METHODS,
  ...GITHUB_METHODS,
  ...GITLAB_METHODS,
  ...HOSTED_REVIEW_METHODS,
  ...LINEAR_METHODS,
  ...LINEAR_AGENT_ACCESS_METHODS,
  ...JIRA_METHODS,
  ...SSH_METHODS,
  ...SPEECH_METHODS,
  ...SPEECH_CONTROL_METHODS,
  ...SPEECH_TRANSCRIPTION_METHODS,
  ...EPHEMERAL_VM_METHODS,
  ...VOICE_VIEWER_METHODS,
  ...WORKSPACE_PORT_METHODS,
  ...PLUGIN_METHODS,
  ...SKILL_METHODS,
  ...CLIPBOARD_METHODS,
  ...HOST_CAPABILITY_METHODS,
  ...MOBILE_WEB_BUNDLE_METHODS,
  ...RUNTIME_CLIENT_CAPABILITY_METHODS,
  ...CLIENT_EVENT_METHODS,
  ...CLIENT_UI_METHODS,
  ...EMULATOR_METHODS,
  ...PAIRING_METHODS,
  ...UPDATER_METHODS
]
