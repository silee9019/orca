import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const REMOTE_FILE_PICKER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['file', 'remote-picker'],
    summary: 'Read or operate an exact mounted host directory picker',
    usage:
      'orca file remote-picker --viewer host --target-kind <ssh|runtime> --target <id> --action <status|navigate|up|select|cancel|input|paste|key|row-click|row-select|focus-input> [--picker-instance <current-instance> --path <directory>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'target-kind',
      'target',
      'action',
      'picker-instance',
      'path',
      'text',
      'key',
      'entry'
    ],
    notes: [
      'Input and paste require --text. Key supports Enter, Escape and Backspace. Row actions require the current visible --entry name; single click preserves its 220ms click/doubleclick arbitration. Input receipts acknowledge the draft; deferred path preview completion is read through status.',
      'Status discovers one matching open picker. Every effect requires its current instance. Select returns the committed directory and preserves the original parent draft callback; it does not create a project. Listing executes on the selected SSH target or runtime environment.'
    ]
  }
]
