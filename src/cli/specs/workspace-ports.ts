import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_PORTS_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['workspace-ports', 'scan'],
    summary: 'Workspace ports scan on the selected Orca runtime',
    usage: 'orca workspace-ports scan --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repoId (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the WorkspacePortScanParams parameters from workspace-ports-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['workspace-ports', 'kill'],
    summary: 'Workspace ports kill on the selected Orca runtime',
    usage: 'orca workspace-ports kill --params-file <file|-> --confirm <target> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'Input fields: repoId (optional), pid, port.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the WorkspacePortKillParams parameters from workspace-ports-params. Use --params-file - to read stdin. No inline credential arguments.',
      '--confirm must exactly match `${pid}:${port}`.'
    ],
    destructive: true
  }
]
