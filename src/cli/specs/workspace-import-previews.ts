import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_IMPORT_PREVIEW_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['settings', 'preview-ghostty-import'],
    summary: 'Preview Ghostty configuration differences on the desktop host',
    usage: 'orca settings preview-ghostty-import [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Reads the selected desktop host’s existing Ghostty discovery/parser/theme mapping and compares with that host’s Orca profile. Returns the setting diff and unsupported key names without applying settings or changing source files.',
      'Preserves existing discovery order, file-size limits and theme handling. An empty preview can also reflect discovery/read limitations and is not proof that no config exists.',
      'Explicit preview errors fail the command. Node hosts without the desktop service and old peers fail without scanning the client home. Does not open a native dialog or change a renderer.'
    ]
  },
  {
    path: ['settings', 'preview-warp-auto'],
    summary: 'Preview automatically discovered Warp themes on the desktop host',
    usage: 'orca settings preview-warp-auto [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Uses the desktop auto source with the original directory discovery, file/preview budgets, bounded parser worker, duplicate IDs and skipped-file warnings. Returns theme candidates without installing them or changing source files.',
      'An empty result or skipped files do not prove all themes were scanned. This command has no native picker; chooseFile/chooseFolder require their owning desktop viewer flow.',
      'Explicit preview errors fail the command. Node hosts without the desktop service and old peers fail without client-home fallback. Reads the selected host, not an SSH child or client profile.'
    ]
  }
]
