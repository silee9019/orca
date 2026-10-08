import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const APP_SURFACE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['app', 'repo-color'],
    summary: 'Set the explicit project badge color through the existing repository writer',
    usage: 'orca app repo-color --repo <selector> --color <hex> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'repo', 'color'],
    notes: [
      'Accepts a complete six-digit color. The answering runtime resolves the project selector, including folder projects. A stored color does not prove a viewer rendered it.'
    ]
  },
  {
    path: ['app', 'native-menu'],
    summary: 'Request a native app menu role on the confirmed desktop',
    usage:
      'orca app native-menu --confirm-target <target> --action <status|about|hide|hide-others|unhide|services> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'confirm-target', 'action'],
    notes: [
      'macOS owns hide/unhide/Services. Services requires a human selection in the native menu. A request does not prove an OS action completed. About opens the original native panel.'
    ]
  },
  {
    path: ['app', 'view', 'control'],
    summary:
      'Control a mounted app shell, onboarding, update card or Vault in an exact desktop viewer',
    usage:
      'orca app view control --viewer <id> --confirm-target <target> --input-file <json> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'confirm-target', 'input-file'],
    notes: [
      'Read app status for viewer and target. Input is a strict domain action, never JavaScript. Example: {"kind":"onboarding","action":"status"}. Unmounted surfaces fail.',
      'Vault row actions require sessionId, agent and host from {"kind":"vault","action":"status"}; deletion additionally requires confirmSessionId. Replies acknowledge the existing callback; poll status for resulting state. They do not prove rendering or a completed launch.',
      'Shell action: status/sidebar/right-sidebar/menu/minimize/maximize/close/floating/onboarding/feedback/expand/update-card/remote-updates. Expand requires tabId; update-card and remote-updates require open. Floating requires open. Onboarding action: status/next/back/jump/agent/theme/request-skip/cancel-skip/confirm-skip.',
      'Vault action: status/query/refresh/retry/load-more/enable-search/search-enabled/scope/host/group/agent/all-agents/hide-empty/limit/reset/resume/new-chat/delete/copy-id/copy-path/copy-resume/open-log/reveal-log/open-cwd/original-pane. Pet-overlay action: status/position (position requires x and y in the selected viewer). Feedback-draft action: status/remove-image/focus (imageId is from status). Update-error action: status/details/primary/secondary/tertiary/close (details requires open). Notification-step action: status/sound/test. Theme-step action: status/import-ghostty. Update-card action: status/update/retry-install/dismiss/collapse/reassurance.'
    ]
  }
]
