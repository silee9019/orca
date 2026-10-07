import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const VOICE_VIEWER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['speech', 'viewer'],
    summary: 'Control voice settings, microphone discovery and VM setup in the host viewer',
    usage:
      'orca speech viewer --viewer host --operation <action> [--device <id>] [--operation-id <id>] [--repo <id>] [--recipe <id>] [--runtime <id>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'operation',
      'device',
      'operation-id',
      'repo',
      'recipe',
      'runtime'
    ],
    notes: [
      'Actions: microphones-list, microphone-select, microphone-request-start, microphone-request-status, microphone-request-cancel, settings-open, key-dialog-open, key-dialog-close, tip-settings-open, tip-show, tip-close, tip-skip, tip-enable, tip-focus-primary, vm-composer, vm-copy-prompt, vm-copy-cleanup.',
      'The host must have an available desktop viewer showing its own runtime. Permission start returns an operation ID; poll status and cancel with that ID. Cancellation cannot dismiss an OS prompt and stops any stream granted later.',
      'An unavailable or old viewer fails explicitly. Viewer actions do not activate or reveal the native window.'
    ]
  }
]
