import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const NETWORK_CONNECTION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['network', 'connection', 'test'],
    summary: 'Test an explicit LAN address and port using the host permission boundary',
    usage: 'orca network connection test --address <LAN-host> --port <port> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'address', 'port']
  }
]
