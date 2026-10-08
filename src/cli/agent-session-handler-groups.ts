import { AGENT_SESSION_WATCH_HANDLER_GROUPS } from './agent-session-watch-handler-groups'
import type { HandlerGroup } from './handler-group-manifest'

export const AGENT_SESSION_HANDLER_GROUPS: readonly HandlerGroup[] = [
  ...AGENT_SESSION_WATCH_HANDLER_GROUPS,
  {
    name: 'terminal-private-spawn',
    keys: ['terminal spawn'],
    load: async () =>
      (await import('./handlers/terminal-private-spawn.js')).TERMINAL_PRIVATE_SPAWN_HANDLERS
  },
  {
    name: 'terminal-listener-count',
    keys: ['terminal data-listener-count'],
    load: async () =>
      (await import('./handlers/terminal-listener-count.js')).TERMINAL_LISTENER_COUNT_HANDLERS
  },
  {
    name: 'terminal-host-viewport',
    keys: ['terminal claim-host-viewport'],
    load: async () =>
      (await import('./handlers/terminal-host-viewport.js')).TERMINAL_HOST_VIEWPORT_HANDLERS
  },
  {
    name: 'terminal-host-resize',
    keys: ['terminal resize-host'],
    load: async () =>
      (await import('./handlers/terminal-host-resize.js')).TERMINAL_HOST_RESIZE_HANDLERS
  },
  {
    name: 'terminal-render-evidence',
    keys: ['terminal write-render-evidence'],
    load: async () =>
      (await import('./handlers/terminal-render-evidence.js')).TERMINAL_RENDER_EVIDENCE_HANDLERS
  },
  {
    name: 'daemon-folder-access',
    keys: [
      'terminal daemon folder-access-plan',
      'terminal daemon folder-access-start',
      'terminal daemon folder-access-status',
      'terminal daemon folder-access-cancel',
      'terminal daemon folder-access-complete'
    ],
    load: async () =>
      (await import('./handlers/daemon-folder-access.js')).DAEMON_FOLDER_ACCESS_HANDLERS
  },
  {
    name: 'daemon-restart',
    keys: ['terminal daemon restart-plan', 'terminal daemon restart'],
    load: async () => (await import('./handlers/daemon-restart.js')).DAEMON_RESTART_HANDLERS
  },
  {
    name: 'terminal-presentation-wait',
    keys: ['terminal wait-driver', 'terminal wait-fit'],
    load: async () =>
      (await import('./handlers/terminal-presentation-wait.js')).TERMINAL_PRESENTATION_WAIT_HANDLERS
  },
  {
    name: 'terminal-pty-input',
    keys: ['terminal write-input', 'terminal write-input-accepted'],
    load: async () => (await import('./handlers/terminal-pty-input.js')).TERMINAL_PTY_INPUT_HANDLERS
  },
  {
    name: 'remote-workspace-publish',
    keys: ['terminal publish-workspace'],
    load: async () =>
      (await import('./handlers/remote-workspace-publish.js')).REMOTE_WORKSPACE_PUBLISH_HANDLERS
  },
  {
    name: 'ai-vault-list-cancel',
    keys: ['agent history cancel'],
    load: async () =>
      (await import('./handlers/ai-vault-list-cancel.js')).AI_VAULT_LIST_CANCEL_HANDLERS
  },
  {
    name: 'terminal-preview-input',
    keys: ['terminal preview-input'],
    load: async () =>
      (await import('./handlers/terminal-preview-input.js')).TERMINAL_PREVIEW_INPUT_HANDLERS
  },
  {
    name: 'terminal-pty-stop',
    keys: ['terminal stop-pty'],
    load: async () => (await import('./handlers/terminal-pty-stop.js')).TERMINAL_PTY_STOP_HANDLERS
  },
  {
    name: 'workspace-session-write',
    keys: ['terminal set-session', 'terminal patch-session', 'terminal checkpoint-session'],
    load: async () =>
      (await import('./handlers/workspace-session-write.js')).WORKSPACE_SESSION_WRITE_HANDLERS
  },
  {
    name: 'agent-pane-authority',
    keys: ['agent status retire-pane', 'agent status restore-pane', 'agent status transfer-pane'],
    load: async () =>
      (await import('./handlers/agent-pane-authority.js')).AGENT_PANE_AUTHORITY_HANDLERS
  },
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
