import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_KEYBINDING_FILE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['keybindings', 'ensure-file'],
    summary: 'Create and reload the keybindings file on the selected runtime host',
    usage: 'orca keybindings ensure-file [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Uses the selected runtime host home and its existing keybinding service. Returns the file path and refreshed snapshot; desktop hosts broadcast the change and rebuild the menu.',
      'Does not create a file on the CLI client or an unrelated SSH workspace host. Old peers fail without local fallback.'
    ]
  },
  {
    path: ['keybindings', 'open-file'],
    summary: 'Ask the selected runtime host desktop to open its keybindings file',
    usage: 'orca keybindings open-file --confirm keybindings [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'confirm'],
    notes: [
      'Requires --confirm keybindings. Opens only the host service file path using the host OS. An OS acceptance is not proof that an editor rendered the file.',
      'Headless Node hosts reject the action before creating a file. OS errors and missing peer methods fail without opening anything on the CLI client.'
    ]
  },
  {
    path: ['keybindings', 'reveal-file'],
    summary: 'Ask the selected runtime host desktop to reveal its keybindings file',
    usage: 'orca keybindings reveal-file --confirm keybindings [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'confirm'],
    notes: [
      'Requires --confirm keybindings. Reveals only the host service file path in the host file manager. The result confirms dispatch, not visible file-manager rendering.',
      'Headless Node hosts reject the action before creating a file. Missing peer methods fail without local fallback.'
    ]
  }
]
