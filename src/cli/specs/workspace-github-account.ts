import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_GITHUB_ACCOUNT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['github', 'viewer'],
    summary: 'Read the selected runtime GitHub account identity',
    usage: 'orca github viewer --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'The selected runtime owns account credentials. These account operations do not target an SSH child repo or another client account.',
      'Input is JSON from a regular file or stdin with --params-file -. Old peers fail explicitly without fallback.',
      'Input example: {}'
    ]
  },
  {
    path: ['github', 'diagnose-auth'],
    summary: 'Diagnose GitHub authentication for the selected runtime',
    usage: 'orca github diagnose-auth --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'The selected runtime owns account credentials. These account operations do not target an SSH child repo or another client account.',
      'Input is JSON from a regular file or stdin with --params-file -. Old peers fail explicitly without fallback.',
      'Input example: {"host":"github.example.invalid"}'
    ]
  },
  {
    path: ['github', 'check-orca-starred'],
    summary: 'Check whether the runtime account starred Orca',
    usage: 'orca github check-orca-starred --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'The selected runtime owns account credentials. These account operations do not target an SSH child repo or another client account.',
      'Input is JSON from a regular file or stdin with --params-file -. Old peers fail explicitly without fallback.',
      'Returns true, false or null using the existing account check; null does not prove a negative result or host connectivity.',
      'Input example: {}'
    ]
  },
  {
    path: ['github', 'star-orca'],
    summary: 'Star Orca using the selected runtime account',
    usage: 'orca github star-orca --params-file <file|-> --confirm stablyai/orca [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    destructive: true,
    notes: [
      'The selected runtime owns account credentials. These account operations do not target an SSH child repo or another client account.',
      'Input is JSON from a regular file or stdin with --params-file -. Old peers fail explicitly without fallback.',
      'Requires the exact --confirm stablyai/orca value before dispatch. Uses the existing source enum and success telemetry; a failed provider request returns operation_failed.',
      'Input example: {"source":"settings"}'
    ]
  }
]
