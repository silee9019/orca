import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const SPEECH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['speech', 'models', 'list'],
    summary: 'List speech models, download progress and dictation settings',
    usage: 'orca speech models list [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['speech', 'models', 'download'],
    summary: 'Download a speech model on the selected host',
    usage: 'orca speech models download --model <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'model']
  },
  {
    path: ['speech', 'models', 'cancel'],
    summary: 'Cancel a speech model download on the selected host',
    usage: 'orca speech models cancel --model <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'model']
  },
  {
    path: ['speech', 'models', 'rm'],
    summary: 'Remove a speech model on the selected host',
    usage: 'orca speech models rm --model <id> --confirm <model-id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'model', 'confirm']
  },
  {
    path: ['speech', 'setup'],
    summary: 'Configure dictation enablement, model and mode',
    usage: 'orca speech setup [--enabled true|false] [--model <id>] [--mode hold|toggle] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'enabled', 'model', 'mode']
  },
  {
    path: ['speech', 'key', 'status'],
    summary: 'Read the OpenAI speech credential status on the selected host',
    usage: 'orca speech key status [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['speech', 'key', 'clear'],
    summary: 'Clear the OpenAI speech credential on the selected host',
    usage: 'orca speech key clear [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['speech', 'key', 'save'],
    summary: 'Save the OpenAI speech key from a file or piped stdin',
    usage: 'orca speech key save --input-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'input-file'],
    notes: ['The key is never accepted as a command argument or included in command output.']
  }
]
