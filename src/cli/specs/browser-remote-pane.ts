import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const BROWSER_REMOTE_PANE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'remote-pane'],
    summary:
      'Read, reconnect or send bounded input to an exact remote browser pane in the host viewer',
    usage:
      'orca browser remote-pane --viewer host --page <local-page> --runtime-environment <id> --remote-page <id|none> --action <status|reconnect|click|key|navigate|address|failure|markup|markup-editor|menu|document> [--x <n> --y <n> --button <left|middle> | --key <key> --meta --ctrl --alt --shift] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'page',
      'runtime-environment',
      'remote-page',
      'action',
      'document-workspace',
      'file',
      'menu-action',
      'markup-action',
      'editor-action',
      'value',
      'failure-action',
      'challenge',
      'address-action',
      'text',
      'index',
      'navigation',
      'url',
      'x',
      'y',
      'button',
      'key',
      'meta',
      'ctrl',
      'alt',
      'shift'
    ],
    notes: [
      'Document reuses the remote workspace document owner: --document-workspace <workspace> --file <path>. The target must belong to the same execution host; a receipt proves the store transition, while remote retirement is only reported as requested.',
      'Menu reuses the visible remote context menu: --menu-action <open|status|dismiss|copy-link|copy-page|copy-selection|external-link|external-page|open-orca|back|forward|reload>. Open requires --x and --y in screenshot CSS pixels.',
      'Markup reuses the mounted remote capture and editor: --markup-action <start|cancel|status>; --editor-action <status|tool|color|width|font-size|undo|redo|clear|text-commit|text-cancel|copy> [--value <value> --text <text>]. Copy requires an explicit clipboard acknowledgment.',
      'Failure reuses the visible load failure owner: --failure-action <copy-address|open-external|certificate-proceed>. Certificate proceed requires --challenge <current-id> and the host certificate-trust capability.',
      'Address reuses the mounted address bar: --address-action <draft|submit|open|dismiss|status|preview|select|highlight|next|previous> [--text <draft> --index <n>]. Submission receipts report navigation requested; they do not claim completed navigation.',
      'Navigate requires --navigation <goto|back|forward|reload>; goto also requires --url <url>.',
      'Click coordinates are CSS pixels relative to the viewer viewport. Input receipts prove host RPC completion, not a rendered frame.',
      'A reconnect receipt proves the existing pane owner restarted its open effect. streamConnected separately reports the current stream state.'
    ]
  }
]
