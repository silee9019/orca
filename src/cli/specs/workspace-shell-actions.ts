import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_SHELL_ACTION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['shell', 'copy-document-file'],
    summary: 'Copy a user-named file into an authorized document folder without overwriting',
    usage: 'orca shell copy-document-file --params-file <file|-> --confirm <destPath> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {srcPath, destPath, documentPath, expectedExecutionHostId:"local"}. Confirm the exact destination. All paths belong to the selected desktop host. Source and document must be regular user-named files.',
      'Reuses the existing destination-parent policy: an authorized desktop root or the named document folder, including its realpath/symlink restrictions. Then invokes the original absolute-path and COPYFILE_EXCL operation. Does not overwrite an existing file or modify the source/document.',
      'This command supplies the document-attachment copy context; it does not grant unrestricted writes outside authorized roots/folders. Native desktop only; no client or SSH fallback. Missing service, old peer, permission and copy failures produce no success acknowledgement. No native picker is opened.'
    ]
  },
  {
    path: ['shell', 'open-file'],
    summary: 'Open an existing file with the desktop default application',
    usage: 'orca shell open-file --params-file <file|-> --confirm <path> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {path, expectedExecutionHostId:"local"}. Confirms the exact path and reuses the desktop native absolute/existing path validation and default-application callback. Can open or focus an application.',
      'A failed native open is an error with no success output or native error text. No SSH or client-filesystem fallback. Missing desktop service and old peers fail explicitly. Success is native acceptance, not document rendering or application readiness.'
    ]
  },
  {
    path: ['shell', 'open-file-uri'],
    summary: 'Open a local file URI with the desktop default application',
    usage: 'orca shell open-file-uri --params-file <file|-> --confirm <uri> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {uri, expectedExecutionHostId:"local"}. Confirms the exact URI. Reuses the original file URI decoding policy: file: only, empty or localhost hostname, valid native decoding, then absolute/existing desktop path validation.',
      'Rejects malformed and remote-host URIs; never downloads or opens an HTTP URL. Can open or focus the default application. Success is native acceptance; old peers, absent desktop services and failed opens do not produce success. No client or SSH fallback.'
    ]
  },
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
