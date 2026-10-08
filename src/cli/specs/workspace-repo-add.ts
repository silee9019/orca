import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_REPO_ADD_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['repo', 'add-desktop-local'],
    summary: 'Register an existing Git repo or folder through the desktop add flow',
    usage: 'orca repo add-desktop-local --params-file <file|-> --confirm <path> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {path,kind?:"git"|"folder",displayName?,expectedExecutionHostId:"local"}. Requires an existing absolute desktop directory. Reuses the original add-from-path service, Git root/subdirectory/linked-worktree dedup, project-host import stamp and workspace-root preparation. Default kind is git.',
      'The selected desktop reads the path. No client/SSH fallback. Registration can prepare its configured workspace root but does not delete the source or create a commit. A registered repo does not prove an agent or terminal started. Node service absence and old peers fail explicitly.'
    ]
  },
  {
    path: ['repo', 'add-desktop-remote'],
    summary: 'Register an SSH repo or folder path through the desktop add flow',
    usage: 'orca repo add-desktop-remote --params-file <file|-> --confirm <remotePath> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {connectionId,remotePath,kind?:"git"|"folder",displayName?,expectedExecutionHostId:"local"}. The desktop controller uses the existing SSH provider, home/root resolution, host-qualified dedup and host-root notification. Default kind is git. Confirms the supplied remotePath before resolving it.',
      'A disconnected target fails without registering the client/local path. Git mode checks the repository through that provider; folder mode retains the original registration policy and does not prove the remote directory exists. Existing registrations return their original repo. A catalog registration/notification does not prove a remote session is ready or a process exited. No clone, Git init or source deletion is requested. Node service absence and old peers fail explicitly.',
      'Transport timeout does not cancel or roll back registration; inspect the selected owner catalog before retrying. Original error/credential diagnostics are not printed as successful output.'
    ]
  }
]
