import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_KEYBINDING_FILE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['keybindings', 'mac-captured-digit-row'],
    summary: 'Read macOS captured digit-row chords on the selected runtime host',
    usage: 'orca keybindings mac-captured-digit-row [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Uses the desktop live-preference probe, 500ms deadline and physical-key parser on the selected runtime host. Does not read the CLI client preferences or change OS settings.',
      'Returns [] on non-macOS hosts and on probe failure, matching the desktop API. An empty result does not prove that the OS has no shortcut conflicts.',
      'Only parsed chords are returned, never raw preferences. Old hosts fail without a client-side probe; no viewer or Git workspace is required.'
    ]
  },
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
