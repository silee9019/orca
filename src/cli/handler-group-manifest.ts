import { CONNECTIONS_HANDLER_GROUPS } from './connections-handler-groups'
import { APP_LIFECYCLE_HANDLER_GROUPS } from './app-lifecycle-handler-groups'
import { SETTINGS_HANDLER_GROUPS } from './settings-handler-groups'
import { TCC_THRESHOLD_OBSERVE_HANDLER_GROUPS } from './tcc-threshold-observe-handler-groups'
import { CODEX_ACCOUNT_OBSERVE_HANDLER_GROUPS } from './codex-account-observe-handler-groups'
import { OS_PERMISSION_HANDLER_GROUPS } from './os-permission-handler-groups'
import { RESOURCE_MANAGER_HANDLER_GROUPS } from './resource-manager-handler-groups'
import { ACCOUNT_INSPECTION_HANDLER_GROUPS } from './account-inspection-handler-groups'
import { ACCOUNT_HANDLER_GROUPS } from './account-handler-groups'
import { ACCOUNT_VIEWER_HANDLER_GROUPS } from './account-viewer-handler-groups'
import { USAGE_HANDLER_GROUPS } from './usage-handler-groups'
import { EXTENSIONS_HANDLER_GROUPS } from './extensions-handler-groups'
import { BROWSER_VIEWER_HANDLER_GROUPS } from './browser-viewer-handler-groups'
import { EMULATOR_HANDLER_GROUPS } from './emulator-handler-groups'
import { SPEECH_VM_HANDLER_GROUPS } from './speech-vm-handler-groups'
import { SEARCH_VIEWER_HANDLER_GROUPS } from './search-viewer-handler-groups'
import { BROWSER_DOCUMENT_HANDLER_GROUPS } from './browser-document-handler-groups'
import { BROWSER_REMOTE_PANE_HANDLER_GROUPS } from './browser-remote-pane-handler-groups'
import { BROWSER_SETTINGS_HANDLER_GROUPS } from './browser-settings-handler-groups'
import { FLOATING_BROWSER_HANDLER_GROUPS } from './floating-browser-handler-groups'
import { LINKED_BROWSER_HANDLER_GROUPS } from './linked-browser-handler-groups'
import { REMOTE_FILE_PICKER_HANDLER_GROUPS } from './remote-file-picker-handler-groups'
import { PLUGIN_MARKETPLACE_HANDLER_GROUPS } from './plugin-marketplace-handler-groups'
import { COMPUTER_PERMISSIONS_HANDLER_GROUPS } from './computer-permissions-handler-groups'
import { BROWSER_OBSERVATION_HANDLER_GROUPS } from './browser-observation-handler-groups'
import type { CommandHandler } from './dispatch'
import { BROWSER_HANDLER_GROUPS } from './browser-handler-groups'

export type HandlerGroup = {
  name: string
  // Eager keys detect duplicate commands without loading handler modules.
  keys: readonly string[]
  load: () => Promise<Record<string, CommandHandler>>
}

export const HANDLER_GROUPS: readonly HandlerGroup[] = [
  ...TCC_THRESHOLD_OBSERVE_HANDLER_GROUPS,
  ...CODEX_ACCOUNT_OBSERVE_HANDLER_GROUPS,
  ...OS_PERMISSION_HANDLER_GROUPS,
  ...RESOURCE_MANAGER_HANDLER_GROUPS,
  ...ACCOUNT_INSPECTION_HANDLER_GROUPS,
  ...ACCOUNT_HANDLER_GROUPS,
  ...ACCOUNT_VIEWER_HANDLER_GROUPS,
  ...USAGE_HANDLER_GROUPS,
  {
    name: 'project-filter',
    keys: ['ui project-filter get', 'ui project-filter set', 'ui project-filter clear'],
    load: async () => (await import('./handlers/project-filter.js')).PROJECT_FILTER_HANDLERS
  },
  ...SETTINGS_HANDLER_GROUPS,
  ...EXTENSIONS_HANDLER_GROUPS,
  ...APP_LIFECYCLE_HANDLER_GROUPS,
  ...SEARCH_VIEWER_HANDLER_GROUPS,
  ...BROWSER_DOCUMENT_HANDLER_GROUPS,
  ...BROWSER_REMOTE_PANE_HANDLER_GROUPS,
  ...BROWSER_SETTINGS_HANDLER_GROUPS,
  ...FLOATING_BROWSER_HANDLER_GROUPS,
  ...LINKED_BROWSER_HANDLER_GROUPS,
  ...REMOTE_FILE_PICKER_HANDLER_GROUPS,
  ...PLUGIN_MARKETPLACE_HANDLER_GROUPS,

  ...COMPUTER_PERMISSIONS_HANDLER_GROUPS,
  ...BROWSER_OBSERVATION_HANDLER_GROUPS,
  ...CONNECTIONS_HANDLER_GROUPS,
  {
    name: 'core',
    keys: ['claude-teams', 'open', 'serve', 'status'],
    load: async () => (await import('./handlers/core.js')).CORE_HANDLERS
  },
  {
    name: 'account',
    keys: ['account add', 'account list', 'account select', 'account rm'],
    load: async () => (await import('./handlers/account.js')).ACCOUNT_HANDLERS
  },
  {
    name: 'artifacts',
    keys: [
      'artifacts viewer',
      'artifacts list',
      'artifacts share',
      'artifacts update',
      'artifacts unshare',
      'artifacts delete'
    ],
    load: async () => (await import('./handlers/artifacts.js')).ARTIFACT_HANDLERS
  },
  {
    name: 'automations',
    keys: [
      'automations list',
      'automations show',
      'automations create',
      'automations edit',
      'automations remove',
      'automations run',
      'automations runs'
    ],
    load: async () => (await import('./handlers/automations.js')).AUTOMATION_HANDLERS
  },
  {
    name: 'project',
    keys: [
      'project list',
      'project setups',
      'project setup-existing-folder',
      'project setup-clone',
      'project setup-create',
      'project setup-update',
      'project setup-delete'
    ],
    load: async () => (await import('./handlers/project.js')).PROJECT_HANDLERS
  },
  {
    name: 'repo',
    keys: [
      'repo list',
      'repo add',
      'repo show',
      'repo set',
      'repo set-base-ref',
      'repo search-refs'
    ],
    load: async () => (await import('./handlers/repo.js')).REPO_HANDLERS
  },
  {
    name: 'worktree',
    keys: [
      'worktree ps',
      'worktree list',
      'worktree show',
      'worktree current',
      'worktree create',
      'worktree set',
      'worktree rm'
    ],
    load: async () => (await import('./handlers/worktree.js')).WORKTREE_HANDLERS
  },
  {
    name: 'file',
    keys: ['file open', 'file diff', 'file open-changed'],
    load: async () => (await import('./handlers/file.js')).FILE_HANDLERS
  },
  {
    name: 'terminal',
    keys: [
      'terminal list',
      'terminal show',
      'terminal read',
      'terminal send',
      'terminal wait',
      'terminal stop',
      'terminal rename',
      'terminal create',
      'terminal switch',
      'terminal close',
      'terminal split'
    ],
    load: async () => (await import('./handlers/terminal.js')).TERMINAL_HANDLERS
  },
  ...BROWSER_HANDLER_GROUPS,
  ...BROWSER_VIEWER_HANDLER_GROUPS,
  {
    name: 'orchestration',
    keys: [
      'orchestration run-create',
      'orchestration run-use',
      'orchestration run-current',
      'orchestration run-list',
      'orchestration run-show',
      'orchestration send',
      'orchestration check',
      'orchestration reply',
      'orchestration inbox',
      'orchestration task-create',
      'orchestration task-list',
      'orchestration task-update',
      'orchestration worker-start',
      'orchestration worker-show',
      'orchestration worker-read',
      'orchestration worker-stop',
      'orchestration worker-abandon',
      'orchestration worker-release',
      'orchestration worker-retain',
      'orchestration worker-list',
      'orchestration dispatch',
      'orchestration ask',
      'orchestration dispatch-show',
      'orchestration coordinator-start',
      'orchestration coordinator-stop',
      'orchestration request-show',
      'orchestration gate-create',
      'orchestration gate-resolve',
      'orchestration gate-list',
      'orchestration reset'
    ],
    load: async () => (await import('./handlers/orchestration.js')).ORCHESTRATION_HANDLERS
  },
  ...EMULATOR_HANDLER_GROUPS,
  {
    name: 'computer',
    keys: [
      'computer capabilities',
      'computer list-apps',
      'computer permissions',
      'computer list-windows',
      'computer get-app-state',
      'computer click',
      'computer perform-secondary-action',
      'computer scroll',
      'computer drag',
      'computer type-text',
      'computer press-key',
      'computer hotkey',
      'computer paste-text',
      'computer set-value'
    ],
    load: async () => (await import('./handlers/computer.js')).COMPUTER_HANDLERS
  },
  {
    name: 'agent-hooks',
    keys: ['agent hooks prepare-codex', 'agent hooks status', 'agent hooks off', 'agent hooks on'],
    load: async () => (await import('./handlers/agent-hooks.js')).AGENT_HOOK_HANDLERS
  },
  {
    name: 'profile-state',
    keys: ['profile state exports', 'profile state rollback'],
    load: async () => (await import('./handlers/profile-state.js')).PROFILE_STATE_HANDLERS
  },
  {
    name: 'diagnostics',
    keys: ['diagnostics memory'],
    load: async () => (await import('./handlers/diagnostics.js')).DIAGNOSTICS_HANDLERS
  },
  {
    name: 'introspection',
    keys: ['agent-context'],
    load: async () => (await import('./handlers/introspection.js')).INTROSPECTION_HANDLERS
  },
  {
    name: 'environment',
    keys: [
      'host name',
      'host list',
      'environment add',
      'environment list',
      'environment show',
      'environment rm'
    ],
    load: async () => (await import('./handlers/environment.js')).ENVIRONMENT_HANDLERS
  },
  {
    name: 'linear',
    keys: [
      'linear save-issue',
      'linear list-issues',
      'linear relation add',
      'linear relation remove',
      'linear issue',
      'linear search',
      'linear team list',
      'linear team members',
      'linear team states',
      'linear team labels',
      'linear project list',
      'linear list',
      'linear status set',
      'linear assignee set',
      'linear assignee clear',
      'linear priority set',
      'linear priority clear',
      'linear estimate set',
      'linear estimate clear',
      'linear due-date set',
      'linear due-date clear',
      'linear label add',
      'linear label remove',
      'linear label set',
      'linear comment add',
      'linear attach',
      'linear create'
    ],
    load: async () => (await import('./handlers/linear.js')).LINEAR_HANDLERS
  },
  ...SPEECH_VM_HANDLER_GROUPS,
  {
    name: 'vm',
    keys: ['vm recipe doctor'],
    load: async () => (await import('./handlers/vm.js')).VM_HANDLERS
  },
  {
    name: 'skill-sharing',
    keys: ['skills installed', 'skills share'],
    load: async () => (await import('./handlers/skill-sharing.js')).SKILL_SHARING_HANDLERS
  },
  {
    name: 'skills',
    keys: ['skills list', 'skills get', 'skills install', 'skills update'],
    load: async () => (await import('./handlers/skills.js')).SKILL_HANDLERS
  }
]
