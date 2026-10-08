import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_HOST_PATH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['file', 'mkdir-host-path'],
    summary: 'Create a directory at an authorized path on the selected desktop host',
    usage: 'orca file mkdir-host-path --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {dirPath, expectedExecutionHostId, connectionId?, expectedSshTargetId?, expectedSshConnectionGeneration?}. Paths belong to the selected host; the client cwd is never prepended.',
      'Uses the desktop root and symlink authorization, existing no-clobber check and recursive parent creation. SSH mutations require the existing matching target and generation. No local fallback on SSH failure.',
      'Node hosts without the desktop service and old peers fail explicitly. Folder workspaces remain supported by the existing root policy.'
    ]
  },
  {
    path: ['file', 'host-path-exists'],
    summary: 'Check an authorized absolute path on the selected desktop host',
    usage: 'orca file host-path-exists --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {filePath, connectionId?, access?}. Uses the desktop authorization and LocalFileAccess policy. access supports user-file, document-resource, chat-image and document-folder with their existing purpose restrictions.',
      'Default access remains inside authorized roots. user-file explicitly names a local file without persisting a grant. Document access includes documentPath. Filesystem contents are not returned.',
      'Returns false only for the existing ENOENT classification. Denied access, provider loss and other failures are errors. Node hosts without the desktop service and old peers fail; the client filesystem is never substituted.'
    ]
  }
]
