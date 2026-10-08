import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const REMOTE_WORKSPACE_READ_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'remote-workspace', 'state'],
    summary: 'Read the canonical SSH relay workspace snapshot for one target',
    usage: 'orca agent remote-workspace state --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: [
      'Requires {targetId}. Uses the addressed runtime’s existing SSH connection and snapshot observation cache. Output can contain private titles, paths and layouts. A null snapshot means missing target, unavailable connection or unsupported relay; it is not evidence of exited processes. No new connection or local fallback.'
    ]
  },
  {
    path: ['agent', 'remote-workspace', 'targets'],
    summary: 'List SSH targets with an active canonical multiplexer on the addressed runtime',
    usage: 'orca agent remote-workspace targets [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Reports control-plane connections, not process liveness. An uninstalled connection store is an error.'
    ]
  },
  {
    path: ['agent', 'remote-workspace', 'clients'],
    summary: 'Refresh and read best-effort workspace presence on connected SSH targets',
    usage: 'orca agent remote-workspace clients --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: [
      'Accepts {targetIds?:string[]}; omitted selects all currently connected targets. Uses the canonical presence request, publishing this runtime’s client ID and device name. Output includes device identities. Results are always complete:false because the existing presence reader turns relay failures into empty client lists. Empty lists do not prove client or process absence.'
    ]
  },
  {
    path: ['agent', 'remote-workspace', 'client-id'],
    summary: 'Read the addressed runtime’s canonical workspace client identity',
    usage: 'orca agent remote-workspace client-id [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Returns the same process-lifetime client ID used by the renderer and SSH presence protocol. It is not a credential and may change when the runtime restarts.'
    ]
  }
]
