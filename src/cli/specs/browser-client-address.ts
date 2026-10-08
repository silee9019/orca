import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_CLIENT_ADDRESS_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'client-address'],
    summary: 'Edit the address field of an exact client-hosted page in its host viewer',
    usage:
      'orca browser client-address --viewer host --worktree <workspace> --page <page> --runtime-environment <environment> --remote-page <remote-page> --browser-client <client> --browser-host-generation <generation> --page-host-generation <generation> --action <status|draft|open|focus|blur|dismiss|next|previous|preview|highlight> [--text <text>] [--index <index>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'worktree',
      'page',
      'runtime-environment',
      'remote-page',
      'browser-client',
      'browser-host-generation',
      'page-host-generation',
      'action',
      'text',
      'index'
    ],
    notes: [
      '--runtime-environment identifies the materialized client page; global --environment selects the viewer runtime independently. Reuses the existing address controller and its DOM readback. Navigation submission and suggestion selection are unsupported by this command; use client-navigate for HTTP(S) navigation completion. Native rendering and OS focus are not acknowledged.'
    ]
  }
]
