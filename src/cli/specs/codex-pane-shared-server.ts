import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const CODEX_PANE_SHARED_SERVER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'codex-server', 'status'],
    summary: 'Read whether a local pane joins its Codex shared server',
    usage: 'orca agent codex-server status --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: [
      'Requires {terminal, expectedIncarnationId?}. Uses the execution host’s existing local non-WSL pane checks. joined:false does not prove the server is absent.'
    ]
  },
  {
    path: ['agent', 'codex-server', 'disable-auto-start'],
    summary: 'Disable auto-start in the addressed pane’s Codex home and read it back',
    usage: 'orca agent codex-server disable-auto-start --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    destructive: true,
    notes: [
      'Requires {terminal, expectedIncarnationId?, confirm:true}. Changes the Codex home shared by other panes using that home. Does not stop a running server.'
    ]
  },
  {
    path: ['agent', 'codex-server', 'stop'],
    summary: 'Stop the addressed pane-home Codex shared server and verify absence',
    usage: 'orca agent codex-server stop --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    destructive: true,
    notes: [
      'Requires {terminal, expectedIncarnationId?, confirm:true}. Affects all clients using that Codex home. Unknown stop outcome fails; inspect before retrying.'
    ]
  }
]
