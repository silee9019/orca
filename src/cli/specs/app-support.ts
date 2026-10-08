import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const APP_SUPPORT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['app', 'onboarding', 'get'],
    aliases: [['app', 'onboarding', 'show']],
    summary: 'Read onboarding progress',
    usage: 'orca app onboarding get [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Uses the selected desktop runtime. Diagnostic preview must be read before upload; collection consent is checked again before sending. Telemetry submission can be dropped by consent, schema validation or rate limits.'
    ]
  },
  {
    path: ['app', 'onboarding', 'update'],
    summary: 'Update onboarding using validated JSON from a file',
    usage: 'orca app onboarding update [--input-file <value>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'input-file'],
    notes: [
      'Uses the selected desktop runtime. Diagnostic preview must be read before upload; collection consent is checked again before sending. Telemetry submission can be dropped by consent, schema validation or rate limits.'
    ]
  },
  {
    path: ['app', 'telemetry', 'status'],
    summary: 'Read effective telemetry consent',
    usage: 'orca app telemetry status [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Uses the selected desktop runtime. Diagnostic preview must be read before upload; collection consent is checked again before sending. Telemetry submission can be dropped by consent, schema validation or rate limits.'
    ]
  },
  {
    path: ['app', 'telemetry', 'set'],
    summary: 'Set telemetry consent using the existing capped consent path',
    usage: 'orca app telemetry set [--opted-in <value>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'opted-in'],
    notes: [
      'Uses the selected desktop runtime. Diagnostic preview must be read before upload; collection consent is checked again before sending. Telemetry submission can be dropped by consent, schema validation or rate limits.'
    ]
  },
  {
    path: ['app', 'telemetry', 'acknowledge'],
    summary: 'Acknowledge a pending notice without emitting an opt-in event',
    usage: 'orca app telemetry acknowledge [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Uses the selected desktop runtime. Diagnostic preview must be read before upload; collection consent is checked again before sending. Telemetry submission can be dropped by consent, schema validation or rate limits.'
    ]
  },
  {
    path: ['app', 'telemetry', 'track'],
    summary: 'Submit a validated telemetry event from a JSON file',
    usage: 'orca app telemetry track [--input-file <value>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'input-file'],
    notes: [
      'Uses the selected desktop runtime. Diagnostic preview must be read before upload; collection consent is checked again before sending. Telemetry submission can be dropped by consent, schema validation or rate limits.'
    ]
  },
  {
    path: ['app', 'diagnostics', 'status'],
    summary: 'Read diagnostic collection consent and availability',
    usage: 'orca app diagnostics status [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Uses the selected desktop runtime. Diagnostic preview must be read before upload; collection consent is checked again before sending. Telemetry submission can be dropped by consent, schema validation or rate limits.'
    ]
  },
  {
    path: ['app', 'diagnostics', 'collect'],
    summary: 'Collect a redacted diagnostic review bundle',
    usage: 'orca app diagnostics collect [--lookback-minutes <value>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'lookback-minutes'],
    notes: [
      'Uses the selected desktop runtime. Diagnostic preview must be read before upload; collection consent is checked again before sending. Telemetry submission can be dropped by consent, schema validation or rate limits.'
    ]
  },
  {
    path: ['app', 'diagnostics', 'preview'],
    summary: 'Read the retained redacted bundle before confirming upload',
    usage: 'orca app diagnostics preview [--submission <value>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'submission'],
    notes: [
      'Uses the selected desktop runtime. Diagnostic preview must be read before upload; collection consent is checked again before sending. Telemetry submission can be dropped by consent, schema validation or rate limits.'
    ]
  },
  {
    path: ['app', 'diagnostics', 'discard'],
    summary: 'Discard an unuploaded review bundle',
    usage: 'orca app diagnostics discard [--submission <value>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'submission'],
    notes: [
      'Uses the selected desktop runtime. Diagnostic preview must be read before upload; collection consent is checked again before sending. Telemetry submission can be dropped by consent, schema validation or rate limits.'
    ]
  },
  {
    path: ['app', 'diagnostics', 'upload'],
    summary: 'Upload the exact reviewed and explicitly confirmed bundle',
    usage:
      'orca app diagnostics upload [--submission <value>] [--confirm-submission <value>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'submission', 'confirm-submission'],
    notes: [
      'Uses the selected desktop runtime. Diagnostic preview must be read before upload; collection consent is checked again before sending. Telemetry submission can be dropped by consent, schema validation or rate limits.'
    ]
  },
  {
    path: ['app', 'diagnostics', 'delete'],
    aliases: [['app', 'diagnostics', 'rm']],
    summary: 'Delete the exact explicitly confirmed uploaded ticket',
    usage: 'orca app diagnostics delete [--ticket <value>] [--confirm-ticket <value>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'ticket', 'confirm-ticket'],
    notes: [
      'Uses the selected desktop runtime. Diagnostic preview must be read before upload; collection consent is checked again before sending. Telemetry submission can be dropped by consent, schema validation or rate limits.'
    ]
  }
]
