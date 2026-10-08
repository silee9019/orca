import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_DIAGNOSTIC_PREVIEW_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['diagnostics', 'open-retained-preview'],
    summary: 'Open an already retained desktop diagnostic review file',
    usage:
      'orca diagnostics open-retained-preview --params-file <file|-> --confirm <bundleSubmissionId> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {bundleSubmissionId, expectedExecutionHostId:"local"}. Confirm the exact ID. Uses the desktop’s retained bundle map, original ID validation, 15-minute expiry and maximum eight previews. Does not collect a new bundle, accept a filesystem path or return diagnostic payload/path.',
      'Can open or focus the native default application. Marks a preview opened only after the original OS callback succeeds. Success acknowledges native acceptance, not that a person read the file. Expired, unknown and failed-open requests produce fixed errors.',
      'Does not upload or bypass the separate native upload consent and rechecks. Node hosts without the desktop service and old peers fail; no client-filesystem or SSH fallback.'
    ]
  }
]
