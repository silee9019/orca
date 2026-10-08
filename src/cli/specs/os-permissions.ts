import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const OS_PERMISSION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['notification', 'play-sound'],
    summary:
      'Play the configured sound in the selected desktop renderer and await playback acknowledgement',
    usage:
      'orca notification play-sound --viewer desktop --confirm true [--volume <0..100>] [--force] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'confirm', 'volume', 'force']
  },
  {
    path: ['computer', 'permission-status'],
    summary: 'Read Computer Use permission status',
    usage: 'orca computer permission-status [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['computer', 'permissions-reset'],
    destructive: true,
    summary: 'Reset Computer Use permissions on the selected execution host',
    usage: 'orca computer permissions-reset --viewer desktop --confirm true [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'confirm']
  },
  {
    path: ['permissions', 'status'],
    summary: 'Read developer permission status on the selected host',
    usage: 'orca permissions status [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['permissions', 'request'],
    summary: 'Request an OS permission; macOS may require a human decision',
    usage: 'orca permissions request --id <permission> --viewer desktop --confirm true [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id', 'viewer', 'confirm']
  },
  {
    path: ['permissions', 'open-settings'],
    summary: 'Open the selected OS permission settings',
    usage:
      'orca permissions open-settings --id <permission> --viewer desktop --confirm true [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id', 'viewer', 'confirm']
  },
  {
    path: ['permissions', 'daemon-attribution'],
    summary: 'Read the selected host daemon TCC attribution and folder evidence',
    usage: 'orca permissions daemon-attribution [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['permissions', 'tcc', 'status'],
    summary: 'Read pending macOS privacy guidance',
    usage: 'orca permissions tcc status [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['permissions', 'tcc', 'consume'],
    summary: 'Claim pending macOS guidance using a private claim file',
    usage: 'orca permissions tcc consume --claim-file <new-path> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'claim-file']
  },
  {
    path: ['permissions', 'tcc', 'acknowledge'],
    summary: 'Acknowledge guidance after the human procedure is complete',
    usage: 'orca permissions tcc acknowledge --claim-file <path> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'claim-file']
  },
  {
    path: ['permissions', 'tcc', 'release'],
    summary: 'Cancel a pending guidance claim without dismissing the notice',
    usage: 'orca permissions tcc release --claim-file <path> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'claim-file']
  },
  {
    path: ['permissions', 'tcc', 'dismiss'],
    destructive: true,
    summary: 'Permanently dismiss macOS privacy guidance',
    usage: 'orca permissions tcc dismiss --viewer desktop --confirm true [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'confirm']
  },
  {
    path: ['notification', 'permission-status'],
    summary: 'Read the desktop notification permission evidence',
    usage: 'orca notification permission-status --viewer desktop [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer']
  },
  {
    path: ['notification', 'away-status'],
    summary: 'Read desktop idle and lock state',
    usage: 'orca notification away-status --viewer desktop [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer']
  },
  {
    path: ['notification', 'probe'],
    summary: 'Probe notification delivery; macOS may show a permission dialog',
    usage: 'orca notification probe --viewer desktop --confirm true [--force] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'confirm', 'force']
  },
  {
    path: ['notification', 'open-settings'],
    summary: 'Open desktop notification settings',
    usage: 'orca notification open-settings --viewer desktop --confirm true [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'confirm']
  },
  {
    path: ['notification', 'dispatch'],
    summary: 'Dispatch a notification through desktop delivery policy',
    usage:
      'orca notification dispatch --viewer desktop --confirm true --request-file <json-path> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'confirm', 'request-file']
  },
  {
    path: ['notification', 'dismiss'],
    summary: 'Dismiss notifications by id and optional pane key',
    usage:
      'orca notification dismiss --viewer desktop --id <notification-id> [--pane-key <key>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'id', 'pane-key']
  }
]
