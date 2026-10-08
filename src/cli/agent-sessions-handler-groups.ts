import type { HandlerGroup } from './handler-group-manifest'

export const AGENT_SESSION_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'terminal-startup-restoration',
    keys: ['terminal prepare-startup'],
    load: async () =>
      (await import('./handlers/terminal-startup-restoration.js'))
        .TERMINAL_STARTUP_RESTORATION_HANDLERS
  },
  {
    name: 'pty-provider-sessions',
    keys: ['terminal provider-sessions'],
    load: async () =>
      (await import('./handlers/pty-provider-sessions.js')).PTY_PROVIDER_SESSION_HANDLERS
  },
  {
    name: 'workspace-review-cache-write',
    keys: ['agent workspace-cache set-github'],
    load: async () =>
      (await import('./handlers/workspace-review-cache-write.js'))
        .WORKSPACE_REVIEW_CACHE_WRITE_HANDLERS
  },
  {
    name: 'workspace-review-cache',
    keys: ['agent workspace-cache github'],
    load: async () =>
      (await import('./handlers/workspace-review-cache.js')).WORKSPACE_REVIEW_CACHE_HANDLERS
  },
  {
    name: 'agent-status-reconcile',
    keys: ['agent status reconcile-ended'],
    load: async () =>
      (await import('./handlers/agent-status-reconcile.js')).AGENT_STATUS_RECONCILE_HANDLERS
  },
  {
    name: 'remote-workspace-read',
    keys: [
      'agent remote-workspace state',
      'agent remote-workspace targets',
      'agent remote-workspace clients',
      'agent remote-workspace client-id'
    ],
    load: async () =>
      (await import('./handlers/remote-workspace-read.js')).REMOTE_WORKSPACE_READ_HANDLERS
  },
  {
    name: 'issue-command-runner',
    keys: ['agent hooks issue-runner'],
    load: async () =>
      (await import('./handlers/issue-command-runner.js')).ISSUE_COMMAND_RUNNER_HANDLERS
  },
  {
    name: 'workspace-session-state',
    keys: ['terminal session-state', 'terminal flush-session'],
    load: async () =>
      (await import('./handlers/workspace-session-state.js')).WORKSPACE_SESSION_STATE_HANDLERS
  },
  {
    name: 'terminal-delivery-debug',
    keys: ['terminal delivery-debug', 'terminal reset-delivery-debug'],
    load: async () =>
      (await import('./handlers/terminal-delivery-debug.js')).TERMINAL_DELIVERY_DEBUG_HANDLERS
  },
  {
    name: 'remote-terminal-capabilities',
    keys: ['terminal remote-capabilities'],
    load: async () =>
      (await import('./handlers/remote-terminal-capabilities.js'))
        .REMOTE_TERMINAL_CAPABILITIES_HANDLERS
  },
  {
    name: 'codex-pane-shared-server',
    keys: [
      'agent codex-server status',
      'agent codex-server disable-auto-start',
      'agent codex-server stop'
    ],
    load: async () =>
      (await import('./handlers/codex-pane-shared-server.js')).CODEX_PANE_SHARED_SERVER_HANDLERS
  },
  {
    name: 'agent-sessions',
    keys: [
      'agent hooks workspace-check',
      'agent hooks setup-imports',
      'agent hooks issue-read',
      'agent hooks issue-write',
      'terminal daemon list',
      'terminal daemon stop',
      'terminal daemon stop-many',
      'agent terminal create',
      'agent terminal ensure',
      'agent session close',
      'agent session reveal',
      'terminal side-effects',
      'terminal signal',
      'terminal main-buffer',
      'terminal saved-scrollback',
      'terminal floating-cwd',
      'terminal confirm-foreground',
      'terminal presence',
      'terminal size',
      'terminal cwd',
      'terminal workspace-hosts',
      'terminal fit-overrides',
      'terminal drivers',
      'agent awake status',
      'agent status infer-interrupt',
      'agent status infer-question-answered',
      'agent status retire-tab',
      'agent status list',
      'agent status dismiss',
      'agent status migration',
      'agent history delete',
      'agent history subagents',
      'terminal clear',
      'terminal reset-input',
      'terminal inspect-process',
      'terminal identity',
      'terminal agent-status',
      'terminal restore-fit',
      'terminal display-mode',
      'terminal set-display-mode',
      'terminal tabs',
      'terminal move-tab',
      'terminal set-tab',
      'terminal set-layout',
      'agent history list',
      'agent history titles',
      'agent history resume-plan',
      'agent history read',
      'agent session held',
      'agent session agents',
      'agent session create-support',
      'agent session history',
      'agent session options',
      'agent session commands',
      'agent session outline',
      'agent session handoff-status',
      'agent session model-catalog',
      'agent session create',
      'agent session send',
      'agent session cancel',
      'agent session respond-approval',
      'agent session respond-question',
      'agent session set-option',
      'agent session conversation-command',
      'agent session rewind',
      'agent session thread-goal',
      'agent session queued-send',
      'agent session queued-delete',
      'agent session queued-resume',
      'agent session restart-list',
      'agent session restart-dismiss',
      'agent session restart-continue'
    ],
    load: async () => (await import('./handlers/agent-sessions.js')).AGENT_SESSION_HANDLERS
  }
]
