import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_LOCALHOST_LABEL_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['workspace-ports', 'register-localhost-label'],
    summary: 'Register an existing desktop localhost proxy label',
    usage:
      'orca workspace-ports register-localhost-label --params-file <file|-> --confirm <targetUrl> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {targetUrl,projectName,worktreeName,repoId?,worktreeId?,expectedExecutionHostId:"local"}. Requires an HTTP URL without credentials, query or fragment. Reuses the original parser, loopback/live-workspace-port target allowlist and single desktop proxy. Node service absence and old peers fail explicitly; no alternate host/client fallback.',
      'The returned *.orca.localhost URL listens on the selected desktop loopback, not the CLI client or SSH host. It does not create a tunnel or start a target server. Label names/IDs are display metadata and do not prove a worktree, process owner or remote execution readiness. Registration may succeed while the target is unavailable.',
      'Repeated registration reuses the original label key. Original worktree teardown unregisters matching IDs; the desktop owns proxy lifetime. No CLI-owned proxy, revoke or visibility lease is fabricated. Timeout does not cancel or remove a registration; inspect the selected desktop before retrying.'
    ]
  }
]
