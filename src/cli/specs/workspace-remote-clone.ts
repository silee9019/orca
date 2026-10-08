import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_REMOTE_CLONE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['repo', 'clone-desktop-remote-start'],
    summary: 'Start an owned clone on an explicit SSH host',
    usage:
      'orca repo clone-desktop-remote-start --params-file <file|-> --confirm <ssh-host:destination> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",expectedCloneHostId:"ssh:<id>",url,destination}. URL is read from stdin/file, never a flag or confirmation. Uses original cloneRemoteRepo, host path-flavor/containment checks, per-destination in-flight guard and remote repo registration/folder upgrade. Destination must be absolute on the selected host; home expansion and caller controllers/connectionId/request IDs are rejected.',
      'Returns a CLI request ID, not clone completion. Check status/result. One CLI slot; renderer activeRemoteClone/abort is separate. Same-destination renderer/CLI clones still share the original in-flight guard. No client/local fallback. Missing service/old peers fail explicitly. Transport timeout does not cancel accepted work; new start replaces a settled result.'
    ]
  },
  {
    path: ['repo', 'clone-desktop-remote-status'],
    summary: 'Read state and percent of a CLI SSH clone',
    usage: 'orca repo clone-desktop-remote-status --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId}. States pending/cancel_requested/completed/cancelled/failed; percent comes from original clone progress. Raw progress phase/URL/errors are discarded. executionVerdict stays unverifiable. Terminal records expire after15minutes.'
    ]
  },
  {
    path: ['repo', 'clone-desktop-remote-cancel'],
    summary: 'Abort only a CLI-owned SSH clone',
    usage: 'orca repo clone-desktop-remote-cancel --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId}. Aborts the original provider.clone signal. cancel_requested retains the slot until settlement; late receipts are discarded. Renderer abort cannot cancel CLI clones and CLI cancellation cannot stop renderer/local clones. No promise of remote process exit or checkout/registration rollback; inspect destination and repo state after cancellation/failure.'
    ]
  },
  {
    path: ['repo', 'clone-desktop-remote-result'],
    summary: 'Read a sanitized completed SSH clone receipt',
    usage: 'orca repo clone-desktop-remote-result --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId}. Returns repoId/path/executionHostId/kind only after profile write barrier. Host provider/authority is checked before writes and after asynchronous registration probes. Includes existing registrations, which are not fresh clone proofs. Does not prove renderer readiness or remote process exit. Pending/failed/cancelled/replaced/expired results fail explicitly. Cancelling a completed record discards its receipt without undoing registration or files.'
    ]
  }
]
