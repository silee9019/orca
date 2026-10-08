import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_LOCAL_CLONE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['repo', 'clone-desktop-local-start'],
    summary: 'Start an owned clone on an explicit native host',
    usage:
      'orca repo clone-desktop-local-start --params-file <file|-> --confirm <local:destination> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",expectedCloneHostId:"local",url,destination}. URL is read from stdin/file. Uses the original native clone runner, prompt guard, directory claim, generation cleanup and path lock. Native absolute destination required; WSL UNC, caller controllers and SSH host targets are rejected.',
      'Returns a CLI request ID. One CLI slot; renderer global abort is separate. Same-path work still uses the original serial lock. Transport timeout does not cancel accepted work; a new start replaces a settled result.'
    ]
  },
  {
    path: ['repo', 'clone-desktop-local-status'],
    summary: 'Read state and percent of a CLI native clone',
    usage: 'orca repo clone-desktop-local-status --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId}. States pending/cancel_requested/completed/cancelled/failed; percent comes from original clone progress. Raw progress phase/URL/errors are discarded. executionVerdict stays unverifiable. Terminal records expire after 15 minutes.'
    ]
  },
  {
    path: ['repo', 'clone-desktop-local-cancel'],
    summary: 'Abort only a CLI-owned native clone',
    usage: 'orca repo clone-desktop-local-cancel --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId}. Aborts only this request during runner preparation and kills its tracked original Git process. cancel_requested retains the slot until settlement; late receipts are discarded. Renderer abort cannot cancel CLI clones and CLI cancellation cannot stop renderer or SSH clones. No promise of local process exit or checkout/registration rollback; inspect destination and repo state after cancellation/failure.'
    ]
  },
  {
    path: ['repo', 'clone-desktop-local-result'],
    summary: 'Read a sanitized completed native clone receipt',
    usage: 'orca repo clone-desktop-local-result --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId}. Returns repoId/path/executionHostId/kind only after profile write barrier. Native host ownership and cancellation are checked before writes and after icon detection. Includes existing registrations, which are not fresh clone proofs. Does not prove renderer readiness or local process exit. Pending/failed/cancelled/replaced/expired results fail explicitly. Cancelling a completed record discards its receipt without undoing registration or files.'
    ]
  }
]
