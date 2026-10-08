import { DESKTOP_CONTROL_RPC_METHODS } from './desktop-control-methods'
import { USAGE_METHODS } from './usage'
import { RATE_LIMIT_METHODS } from './rate-limits'
import { BROWSER_PROFILE_FILE_METHODS } from './browser-profile-file'
import { BROWSER_VIEWER_METHODS } from './browser-viewer'
import { TERMINAL_STARTUP_RESTORATION_METHODS } from './terminal-startup-restoration'
import { PTY_PROVIDER_SESSION_METHODS } from './pty-provider-sessions'
import { WORKSPACE_REVIEW_CACHE_METHODS } from './workspace-review-cache'
import { WORKSPACE_REVIEW_CACHE_WRITE_METHODS } from './workspace-review-cache-write'
import { AGENT_STATUS_RECONCILE_METHODS } from './agent-status-reconcile'
import { REMOTE_WORKSPACE_READ_METHODS } from './remote-workspace-read'
import { ISSUE_COMMAND_RUNNER_METHODS } from './issue-command-runner'
import { WORKSPACE_SESSION_STATE_METHODS } from './workspace-session-state'
import { TERMINAL_DELIVERY_DEBUG_METHODS } from './terminal-delivery-debug'
import { CODEX_PANE_SHARED_SERVER_METHODS } from './codex-pane-shared-server'
import { TERMINAL_SIGNAL_METHODS } from './terminal-signal'
import { TERMINAL_HOST_DETAILS_METHODS } from './terminal-host-details'
import { DAEMON_MANAGEMENT_METHODS } from './daemon-management'
import { AI_VAULT_SESSION_ACTION_METHODS } from './ai-vault-session-actions'
import { CRASH_REPORT_METHODS } from './crash-report-viewer'
import { SETUP_GUIDE_METHODS } from './setup-guide-viewer'
import { FEATURE_TOUR_METHODS } from './feature-tour-viewer'
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
const CORE_RPC_METHODS = [
  ...TERMINAL_STARTUP_RESTORATION_METHODS,
  ...PTY_PROVIDER_SESSION_METHODS,
  ...WORKSPACE_REVIEW_CACHE_METHODS,
  ...WORKSPACE_REVIEW_CACHE_WRITE_METHODS,
  ...AGENT_STATUS_RECONCILE_METHODS,
  ...REMOTE_WORKSPACE_READ_METHODS,
  ...ISSUE_COMMAND_RUNNER_METHODS,
  ...WORKSPACE_SESSION_STATE_METHODS,
  ...TERMINAL_DELIVERY_DEBUG_METHODS,
  ...CODEX_PANE_SHARED_SERVER_METHODS,
  ...TERMINAL_HOST_DETAILS_METHODS,
  ...TERMINAL_SIGNAL_METHODS,
  ...DAEMON_MANAGEMENT_METHODS,
  ...CRASH_REPORT_METHODS,
  ...SETUP_GUIDE_METHODS,
  ...FEATURE_TOUR_METHODS,
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

export const ALL_RPC_METHODS: (
  | (typeof DESKTOP_CONTROL_RPC_METHODS)[number]
  | (typeof CORE_RPC_METHODS)[number]
)[] = []
ALL_RPC_METHODS.push(...DESKTOP_CONTROL_RPC_METHODS)
ALL_RPC_METHODS.push(...CORE_RPC_METHODS)
