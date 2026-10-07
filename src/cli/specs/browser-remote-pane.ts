import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const BROWSER_REMOTE_PANE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'remote-pane'],
    summary:
      'Read, reconnect or send bounded input to an exact remote browser pane in the host viewer',
    usage:
      'orca browser remote-pane --viewer host --page <local-page> --runtime-environment <id> --remote-page <id|none> --action <status|reconnect|click|key|navigate> [--x <n> --y <n> --button <left|middle> | --key <key> --meta --ctrl --alt --shift] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'page',
      'runtime-environment',
      'remote-page',
      'action',
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
      'Navigate requires --navigation <goto|back|forward|reload>; goto also requires --url <url>.',
      'Click coordinates are CSS pixels relative to the viewer viewport. Input receipts prove host RPC completion, not a rendered frame.',
      'A reconnect receipt proves the existing pane owner restarted its open effect. streamConnected separately reports the current stream state.'
    ]
  }
]
