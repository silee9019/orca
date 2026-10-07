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
import type { CommandSpec } from '../args'
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
import { EMULATOR_COMMAND_SPECS } from './emulator'
import { INTROSPECTION_COMMAND_SPECS } from './introspection'
import { LINEAR_COMMAND_SPECS } from './linear'
import { VM_COMMAND_SPECS } from './vm'
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
  ...CORE_COMMAND_SPECS,
  ...ARTIFACT_COMMAND_SPECS,
  ...ACCOUNT_COMMAND_SPECS,
  ...USAGE_COMMAND_SPECS,
  ...RATE_LIMIT_COMMAND_SPECS,
  ...PROJECT_COMMAND_SPECS,
  ...FILE_COMMAND_SPECS,
  ...AUTOMATION_COMMAND_SPECS,
  ...BROWSER_BASIC_COMMAND_SPECS,
  ...BROWSER_ADVANCED_COMMAND_SPECS,
  ...ORCHESTRATION_COMMAND_SPECS,
  ...COMPUTER_COMMAND_SPECS,
  ...AGENT_HOOK_COMMAND_SPECS,
  ...DIAGNOSTICS_COMMAND_SPECS,
  ...INTROSPECTION_COMMAND_SPECS,
  ...ENVIRONMENT_COMMAND_SPECS,
  ...LINEAR_COMMAND_SPECS,
  ...VM_COMMAND_SPECS,
  ...EMULATOR_COMMAND_SPECS,
  ...SKILL_COMMAND_SPECS,
  ...SEARCH_COMMAND_SPECS,
  ...PROFILE_STATE_COMMAND_SPECS
]
