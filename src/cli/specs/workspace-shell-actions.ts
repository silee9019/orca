import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_SHELL_ACTION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['shell', 'reveal'],
    summary: 'Reveal an existing path in the desktop host file manager',
    usage: 'orca shell reveal --params-file <file|-> --confirm <path> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {path, expectedExecutionHostId:"local"}. Confirm the exact path. Uses the desktop host’s original absolute/existing path validation and reveal action; can open or focus a native file manager.',
      'The path belongs to the selected desktop host, including folder workspaces. Active remote runtimes are rejected. No SSH/client-filesystem fallback; missing service and old peers fail explicitly. Success acknowledges the native call, not a visible window.'
    ]
  },
  {
    path: ['shell', 'open-editor'],
    summary: 'Open a path with the desktop host external editor policy',
    usage: 'orca shell open-editor --params-file <file|-> --confirm <path> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {path, expectedExecutionHostId:"local", command?, connectionId?}. Confirm the exact path. Reuses the existing editor command/launcher policy and can open or focus an external application.',
      'Without connectionId, validates the desktop absolute/existing path. With connectionId, resolves that host’s configured SSH target and supported VSCode authority; does not check the remote path on the native filesystem.',
      'Active remote runtimes, missing/invalid SSH targets and unsupported remote editors retain their original failures. Missing desktop service and old peers fail with no client launch. Success acknowledges launch acceptance, not remote connection or editor readiness.'
    ]
  }
]
