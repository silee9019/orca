import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const BROWSER_VIEWER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'grab', 'start'],
    summary: 'start the existing element picker in the host viewer',
    usage: 'orca browser grab start --viewer host --page <id> --intent <copy|annotate> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'intent']
  },
  {
    path: ['browser', 'grab', 'cancel'],
    summary: 'cancel the existing element picker in the host viewer',
    usage: 'orca browser grab cancel --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'grab', 'rearm'],
    summary: 'rearm the existing element picker in the host viewer',
    usage: 'orca browser grab rearm --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'grab', 'exit'],
    summary: 'exit the existing element picker in the host viewer',
    usage: 'orca browser grab exit --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'grab', 'status'],
    summary: 'status the existing element picker in the host viewer',
    usage: 'orca browser grab status --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'toolbar-nav'],
    summary: 'Use the host viewer toolbar history or state-aware reload action',
    usage:
      'orca browser toolbar-nav --viewer host --page <id> --action <back|forward|reload-button|reload|hard-reload> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'action']
  },
  {
    path: ['browser', 'find-ui', 'open'],
    summary: 'open the find bar in the host viewer',
    usage: 'orca browser find-ui open --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'find-ui', 'next'],
    summary: 'next the find bar in the host viewer',
    usage: 'orca browser find-ui next --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'find-ui', 'previous'],
    summary: 'previous the find bar in the host viewer',
    usage: 'orca browser find-ui previous --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'find-ui', 'close'],
    summary: 'close the find bar in the host viewer',
    usage: 'orca browser find-ui close --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'find-ui', 'status'],
    summary: 'status the find bar in the host viewer',
    usage: 'orca browser find-ui status --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'find-ui', 'query'],
    summary: 'Set the query in the host viewer find bar; match counts arrive asynchronously',
    usage: 'orca browser find-ui query --viewer host --page <id> --query <text> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'query']
  },
  {
    path: ['browser', 'zoom'],
    summary: 'Zoom an active browser page in the host viewer',
    usage: 'orca browser zoom --viewer host --page <id> --direction <in|out|reset> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'direction']
  },
  {
    path: ['browser', 'download', 'cancel'],
    destructive: true,
    summary: 'Cancel a download owned by the host viewer',
    usage: 'orca browser download cancel --viewer host --download <id> --confirm [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'download', 'confirm']
  },
  {
    path: ['browser', 'devtools', 'open'],
    summary: 'Open developer tools for a page owned by the host viewer',
    usage: 'orca browser devtools open --viewer host --page <id> --confirm [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'confirm']
  },
  {
    path: ['browser', 'webauthn', 'respond'],
    summary: 'Respond to a WebAuthn account request using a credential ID file',
    usage:
      'orca browser webauthn respond --viewer host --request <id> --credential-file <path> --confirm [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'request', 'credential-file', 'confirm']
  },
  {
    path: ['browser', 'webauthn', 'cancel'],
    summary: 'Cancel a WebAuthn account request owned by the host viewer',
    usage: 'orca browser webauthn cancel --viewer host --request <id> --confirm [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'request', 'confirm']
  },
  {
    path: ['browser', 'annotation', 'list'],
    summary: 'List annotation comments in the host viewer',
    usage: 'orca browser annotation list --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'annotation', 'update'],
    summary: 'Update an existing annotation comment and intent in the host viewer',
    usage:
      'orca browser annotation update --viewer host --page <id> --annotation <id> --comment <text> --intent <fix|change|question|approve> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'annotation', 'comment', 'intent']
  },
  {
    path: ['browser', 'annotation', 'rm'],
    destructive: true,
    summary: 'Delete an annotation in the host viewer',
    usage:
      'orca browser annotation rm --viewer host --page <id> --annotation <id> --confirm [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'annotation', 'confirm']
  },
  {
    path: ['browser', 'annotation', 'clear'],
    destructive: true,
    summary: 'Clear annotations for a browser page in the host viewer',
    usage: 'orca browser annotation clear --viewer host --page <id> --confirm [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'confirm']
  },
  {
    path: ['browser', 'history', 'list'],
    summary: 'List browser history in the host viewer',
    usage: 'orca browser history list --viewer host [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer']
  },
  {
    path: ['browser', 'history', 'clear'],
    destructive: true,
    summary: 'Clear browser history in the host viewer',
    usage: 'orca browser history clear --viewer host --confirm [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'confirm']
  },
  {
    path: ['browser', 'viewport-preset', 'set'],
    summary: 'Set a saved browser viewport preset in the host viewer',
    usage:
      'orca browser viewport-preset set --viewer host --page <id> --preset <mobile-s|mobile-m|mobile-l|tablet|laptop|laptop-l|desktop|default> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'preset']
  }
]
