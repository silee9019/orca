import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const FLOATING_BROWSER_VIEWER_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'floating', 'viewer'],
    summary: 'Create or duplicate through the mounted floating browser owner',
    usage:
      'orca browser floating viewer --viewer host --group <active-group> --action new|duplicate [--browser-tab <id> --source-tab <unified-id>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'group', 'action', 'browser-tab', 'source-tab'],
    notes: [
      'Requires the open floating panel in the local desktop host viewer. Paired web creation remains unavailable.',
      'Duplicate requires an exact browser tab and its unified tab in the active floating group. The owner preserves profile, private partition and insertion position; the result omits URL, title and partition.',
      'The response reports store activation and address focus intent. It does not claim native focus, rendering or durable persistence.'
    ]
  }
]
