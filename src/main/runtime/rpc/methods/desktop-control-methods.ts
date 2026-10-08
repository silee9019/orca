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
import { EXTENSIONS_SIDEBAR_METHODS } from './extensions-sidebar'
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
import { AGENT_STATUS_CLI_METHODS } from './agent-status-cli'
import { WORKSPACE_REMOTE_FILE_DOWNLOAD_METHODS } from './workspace-remote-file-download'
import { WORKSPACE_REMOTE_FOLDER_DOWNLOAD_METHODS } from './workspace-remote-folder-download'
import { WORKSPACE_WORK_ITEM_NOTIFY_METHODS } from './workspace-work-item-notify'
import { WORKSPACE_FILE_WATCH_METHODS } from './workspace-file-watch'
import { WORKSPACE_JIRA_READ_METHODS } from './workspace-jira-reads'
import { WORKSPACE_DOWNLOAD_SESSION_METHODS } from './workspace-download-session'
import { WORKSPACE_GIT_STATUS_METHODS } from './workspace-git-status'
import { WORKSPACE_LOG_TAIL_METHODS } from './workspace-log-tail'
import { WORKSPACE_NOTEBOOK_KERNEL_METHODS } from './workspace-notebook-kernel'
import { WORKSPACE_LOCAL_CLONE_METHODS } from './workspace-local-clone'
import { WORKSPACE_REMOTE_CLONE_METHODS } from './workspace-remote-clone'
import { WORKSPACE_FILE_SEARCH_METHODS } from './workspace-file-search'
import { WORKSPACE_NESTED_SCAN_METHODS } from './workspace-nested-scan'
import { WORKSPACE_FILE_LIST_METHODS } from './workspace-file-list'
import { WORKSPACE_DESKTOP_ADOPT_METHODS } from './workspace-desktop-adopt'
import { WORKSPACE_DESKTOP_REMOVE_METHODS } from './workspace-desktop-remove'
import { WORKSPACE_DESKTOP_CREATE_METHODS } from './workspace-desktop-create'
import { WORKSPACE_LINEAGE_METHODS } from './workspace-lineage'
import { WORKSPACE_SPACE_SCAN_METHODS } from './workspace-space-scan'
import { WORKSPACE_LOCALHOST_LABEL_METHODS } from './workspace-localhost-label'
import { WORKSPACE_GITHUB_REFRESH_METHODS } from './workspace-github-refresh'
import { WORKSPACE_REPO_CREATE_REMOTE_METHODS } from './workspace-repo-create-remote'
import { WORKSPACE_REPO_ADD_METHODS } from './workspace-repo-add'
import { WORKSPACE_REPO_FOLDER_PICKER_METHODS } from './workspace-repo-folder-picker'
import { WORKSPACE_WORKTREE_FORGET_METHODS } from './workspace-worktree-forget'
import { WORKSPACE_CLEANUP_SCAN_METHODS } from './workspace-cleanup-scan'
import { WORKSPACE_REPO_ICON_PICKER_METHODS } from './workspace-repo-icon-picker'
import { WORKSPACE_DIAGNOSTIC_PREVIEW_METHODS } from './workspace-diagnostic-preview'
import { WORKSPACE_NOTEBOOK_ENVIRONMENT_METHODS } from './workspace-notebook-environments'
import { WORKSPACE_SHELL_ACTION_METHODS } from './workspace-shell-actions'
import { WORKSPACE_IMPORT_PREVIEW_METHODS } from './workspace-import-previews'
import { WORKSPACE_REPO_UPDATE_METHODS } from './workspace-repo-update'
import { WORKSPACE_REPO_USERNAME_METHODS } from './workspace-repo-username'
import { WORKSPACE_DESKTOP_META_METHODS } from './workspace-desktop-meta'
import { WORKSPACE_VISIBLE_WORKTREE_METHODS } from './workspace-visible-worktrees'
import { WORKSPACE_HOST_PATH_METHODS } from './workspace-host-path'
import { WORKSPACE_CRASH_REPORT_METHODS } from './workspace-crash-reports'
import { WORKSPACE_MACOS_HOTKEY_METHODS } from './workspace-macos-hotkeys'
import { WORKSPACE_GIT_STARTUP_METHODS } from './workspace-git-startup'
import { WORKSPACE_CLEANUP_DISMISSAL_METHODS } from './workspace-cleanup-dismissals'
import { WORKSPACE_REPO_HOST_METHODS } from './workspace-repo-host'
import { WORKSPACE_CACHED_SCAN_METHODS } from './workspace-cached-scans'
import { WORKSPACE_JIRA_PROJECT_USER_METHODS } from './workspace-jira-project-users'
import { WORKSPACE_LINEAR_ISSUE_FIELD_METHODS } from './workspace-linear-issue-fields'
import { WORKSPACE_GITHUB_ACCOUNT_METHODS } from './workspace-github-account'
import { WORKSPACE_GITLAB_INSPECTION_METHODS } from './workspace-gitlab-inspection'
import { WORKSPACE_KEYBINDING_FILE_METHODS } from './workspace-keybinding-file'
import { WORKSPACE_GIT_IGNORE_METHODS } from './workspace-git-ignore'
import { WORKSPACE_BITBUCKET_METHODS } from './workspace-bitbucket'
import { ACTIVITY_VIEWER_METHODS } from './activity-viewer'
import { SETTINGS_VIEWER_METHODS } from './settings-viewer'
import { SIDEBAR_VIEWER_METHODS } from './sidebar-viewer'
import { CARD_VIEWER_METHODS } from './card-viewer'
import { STATUS_BAR_VIEWER_METHODS } from './status-bar-viewer'
import { WORKSPACE_LIST_VIEWER_METHODS } from './workspace-list-viewer'
import { WORKSPACE_FILTER_METHODS } from './workspace-filter'
import { STATUS_METHODS } from './status'

export const DESKTOP_CONTROL_RPC_METHODS = [
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
  ...EXTENSIONS_SIDEBAR_METHODS,
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
  ...WORKSPACE_REMOTE_FILE_DOWNLOAD_METHODS,
  ...WORKSPACE_REMOTE_FOLDER_DOWNLOAD_METHODS,
  ...WORKSPACE_WORK_ITEM_NOTIFY_METHODS,
  ...WORKSPACE_FILE_WATCH_METHODS,
  ...WORKSPACE_JIRA_READ_METHODS,
  ...WORKSPACE_DESKTOP_ADOPT_METHODS,
  ...WORKSPACE_FILE_LIST_METHODS,
  ...WORKSPACE_FILE_SEARCH_METHODS,
  ...WORKSPACE_DOWNLOAD_SESSION_METHODS,
  ...WORKSPACE_GIT_STATUS_METHODS,
  ...WORKSPACE_LOG_TAIL_METHODS,
  ...WORKSPACE_NOTEBOOK_KERNEL_METHODS,
  ...WORKSPACE_LOCAL_CLONE_METHODS,
  ...WORKSPACE_REMOTE_CLONE_METHODS,
  ...WORKSPACE_NESTED_SCAN_METHODS,
  ...WORKSPACE_DESKTOP_REMOVE_METHODS,
  ...WORKSPACE_DESKTOP_CREATE_METHODS,
  ...WORKSPACE_LINEAGE_METHODS,
  ...WORKSPACE_SPACE_SCAN_METHODS,
  ...WORKSPACE_LOCALHOST_LABEL_METHODS,
  ...WORKSPACE_GITHUB_REFRESH_METHODS,
  ...WORKSPACE_REPO_CREATE_REMOTE_METHODS,
  ...WORKSPACE_REPO_ADD_METHODS,
  ...WORKSPACE_REPO_FOLDER_PICKER_METHODS,
  ...WORKSPACE_WORKTREE_FORGET_METHODS,
  ...WORKSPACE_CLEANUP_SCAN_METHODS,
  ...WORKSPACE_REPO_ICON_PICKER_METHODS,
  ...WORKSPACE_DIAGNOSTIC_PREVIEW_METHODS,
  ...WORKSPACE_NOTEBOOK_ENVIRONMENT_METHODS,
  ...WORKSPACE_SHELL_ACTION_METHODS,
  ...WORKSPACE_DESKTOP_META_METHODS,
  ...WORKSPACE_REPO_USERNAME_METHODS,
  ...WORKSPACE_REPO_UPDATE_METHODS,
  ...WORKSPACE_IMPORT_PREVIEW_METHODS,
  ...WORKSPACE_MACOS_HOTKEY_METHODS,
  ...WORKSPACE_VISIBLE_WORKTREE_METHODS,
  ...WORKSPACE_HOST_PATH_METHODS,
  ...WORKSPACE_CRASH_REPORT_METHODS,
  ...WORKSPACE_GIT_STARTUP_METHODS,
  ...WORKSPACE_GIT_IGNORE_METHODS,
  ...WORKSPACE_KEYBINDING_FILE_METHODS,
  ...WORKSPACE_LINEAR_ISSUE_FIELD_METHODS,
  ...WORKSPACE_JIRA_PROJECT_USER_METHODS,
  ...WORKSPACE_CACHED_SCAN_METHODS,
  ...WORKSPACE_CLEANUP_DISMISSAL_METHODS,
  ...WORKSPACE_REPO_HOST_METHODS,
  ...WORKSPACE_GITHUB_ACCOUNT_METHODS,
  ...WORKSPACE_GITLAB_INSPECTION_METHODS,
  ...WORKSPACE_BITBUCKET_METHODS,
  ...SETTINGS_VIEWER_METHODS,
  ...SIDEBAR_VIEWER_METHODS,
  ...CARD_VIEWER_METHODS,
  ...STATUS_BAR_VIEWER_METHODS,
  ...ACTIVITY_VIEWER_METHODS,
  ...WORKSPACE_LIST_VIEWER_METHODS,
  ...WORKSPACE_FILTER_METHODS,
  ...STATUS_METHODS,
  ...AGENT_STATUS_CLI_METHODS,
  ...TERMINAL_HOST_INVENTORY_METHODS,
  ...TERMINAL_SIDE_EFFECT_SNAPSHOT_METHODS
]
