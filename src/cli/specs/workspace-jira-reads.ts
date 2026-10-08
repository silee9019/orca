import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_JIRA_READ_SPECS: CommandSpec[] = [
  {
    path: ['jira', 'search-start'],
    summary: 'Start a CLI-owned Jira search request',
    usage: 'orca jira search-start --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input: jql, limit (1–100, optional), siteId (optional).',
      'The selected runtime owns credentials and requests. Server UUIDs cannot cancel renderer requests or requests of the other kind.',
      'Cancellation is a request; cancelled is reported only after the original service settles. Pending reads abort after 30 seconds; terminal results expire after 60 seconds. Each kind retains at most 32 requests.',
      'Old peers fail explicitly without executing on another host.'
    ]
  },
  {
    path: ['jira', 'search-status'],
    summary: 'Status a CLI-owned Jira search request',
    usage: 'orca jira search-status --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input: requestId returned by the matching start command.',
      'The selected runtime owns credentials and requests. Server UUIDs cannot cancel renderer requests or requests of the other kind.',
      'Cancellation is a request; cancelled is reported only after the original service settles. Pending reads abort after 30 seconds; terminal results expire after 60 seconds. Each kind retains at most 32 requests.',
      'Old peers fail explicitly without executing on another host.'
    ]
  },
  {
    path: ['jira', 'search-cancel'],
    summary: 'Cancel a CLI-owned Jira search request',
    usage: 'orca jira search-cancel --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input: requestId returned by the matching start command.',
      'The selected runtime owns credentials and requests. Server UUIDs cannot cancel renderer requests or requests of the other kind.',
      'Cancellation is a request; cancelled is reported only after the original service settles. Pending reads abort after 30 seconds; terminal results expire after 60 seconds. Each kind retains at most 32 requests.',
      'Old peers fail explicitly without executing on another host.'
    ]
  },
  {
    path: ['jira', 'summary-start'],
    summary: 'Start a CLI-owned Jira summary request',
    usage: 'orca jira summary-start --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input: key and explicit siteId.',
      'The selected runtime owns credentials and requests. Server UUIDs cannot cancel renderer requests or requests of the other kind.',
      'Cancellation is a request; cancelled is reported only after the original service settles. Pending reads abort after 30 seconds; terminal results expire after 60 seconds. Each kind retains at most 32 requests.',
      'Old peers fail explicitly without executing on another host.'
    ]
  },
  {
    path: ['jira', 'summary-status'],
    summary: 'Status a CLI-owned Jira summary request',
    usage: 'orca jira summary-status --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input: requestId returned by the matching start command.',
      'The selected runtime owns credentials and requests. Server UUIDs cannot cancel renderer requests or requests of the other kind.',
      'Cancellation is a request; cancelled is reported only after the original service settles. Pending reads abort after 30 seconds; terminal results expire after 60 seconds. Each kind retains at most 32 requests.',
      'Old peers fail explicitly without executing on another host.'
    ]
  },
  {
    path: ['jira', 'summary-cancel'],
    summary: 'Cancel a CLI-owned Jira summary request',
    usage: 'orca jira summary-cancel --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input: requestId returned by the matching start command.',
      'The selected runtime owns credentials and requests. Server UUIDs cannot cancel renderer requests or requests of the other kind.',
      'Cancellation is a request; cancelled is reported only after the original service settles. Pending reads abort after 30 seconds; terminal results expire after 60 seconds. Each kind retains at most 32 requests.',
      'Old peers fail explicitly without executing on another host.'
    ]
  }
]
