import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_CRASH_REPORT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['crash-report', 'copy-diagnostics'],
    summary: 'Copy diagnostics to the selected desktop host clipboard',
    usage:
      'orca crash-report copy-diagnostics --params-file <file|-> --confirm host-clipboard [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {reportId?, notes?, submissionFailure?: {error, diagnosticContext?: {status: "uploaded", ticketId} | {status: "not_uploaded", reason}}}. Notes and failure details use only JSON stdin/file.',
      'Uses the existing desktop formatter, redaction and clipboard size limit. Omitting reportId intentionally copies uncaptured diagnostics even if a pending report exists.',
      'Changes the selected host clipboard, never the CLI client clipboard. Stdout contains only ok; no diagnostic text is printed. Node hosts without the service and old peers fail explicitly.'
    ]
  },
  {
    path: ['crash-report', 'submit'],
    summary: 'Submit a report through the selected desktop host feedback pipeline',
    usage:
      'orca crash-report submit --params-file <file|-> --confirm <reportId|uncaptured> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON requires includeDiagnosticLogs:boolean, submitAnonymously:boolean, githubLogin:string|null, githubEmail:string|null; reportId and notes are optional. Choose log consent and identity explicitly. Private fields use only JSON stdin/file.',
      'Confirmation matches reportId or uncaptured when omitted. Uses existing redaction, diagnostic consent/upload, in-flight and duplicate-send guards. Omitting reportId never substitutes a pending report.',
      'Stdout contains only ok, reportId and status. Success preserves the existing pipeline result and may describe an already-sent report; it does not imply a new upload. No fallback to a client account or profile.'
    ]
  },
  {
    path: ['crash-report', 'latest-pending'],
    summary: 'Export the selected desktop host crash report to a new client file',
    usage: 'orca crash-report latest-pending --output-file <new-file> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'output-file'],
    notes: [
      'Uses the existing desktop report store and submitted-report suppression. latest includes dismissed reports; latest-pending selects pending reports. A missing or unreadable store exports JSON null, matching the desktop reader; null is not proof that no crash occurred.',
      'Diagnostic content is written only to the explicitly selected client file, created exclusively with mode 0600 where supported. Existing files and symlinks are not overwritten. Stdout contains only output path, report ID and status.',
      'The host store retains its existing five-report limit. No crash is recorded, uploaded or deleted. Node hosts without the desktop service and old peers fail; the client profile is never substituted.'
    ]
  },
  {
    path: ['crash-report', 'latest'],
    summary: 'Export the selected desktop host crash report to a new client file',
    usage: 'orca crash-report latest --output-file <new-file> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'output-file'],
    notes: [
      'Uses the existing desktop report store and submitted-report suppression. latest includes dismissed reports; latest-pending selects pending reports. A missing or unreadable store exports JSON null, matching the desktop reader; null is not proof that no crash occurred.',
      'Diagnostic content is written only to the explicitly selected client file, created exclusively with mode 0600 where supported. Existing files and symlinks are not overwritten. Stdout contains only output path, report ID and status.',
      'The host store retains its existing five-report limit. No crash is recorded, uploaded or deleted. Node hosts without the desktop service and old peers fail; the client profile is never substituted.'
    ]
  },
  {
    path: ['crash-report', 'dismiss'],
    summary: 'Dismiss a report in the selected desktop host crash store',
    usage: 'orca crash-report dismiss --params-file <file|-> --confirm <reportId> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {reportId}. Confirmation must exactly match reportId. Uses the same submission guards and persisted dismissal as the desktop API.',
      'Related pending reports within the existing five-second crash grouping window are also dismissed. Reports and diagnostic files are not deleted.',
      'An in-flight submission fails without claiming dismissal. An already-sent report returns status sent and dismissed false. No upload or renderer acknowledgement occurs.'
    ]
  }
]
