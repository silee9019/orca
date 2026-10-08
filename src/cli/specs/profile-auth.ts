import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const PROFILE_AUTH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['profile', 'auth', 'start'],
    summary: 'start Orca profile authentication on this host',
    usage: 'orca profile auth start [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['profile', 'auth', 'status'],
    summary: 'status Orca profile authentication on this host',
    usage: 'orca profile auth status [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['profile', 'auth', 'cancel'],
    summary: 'cancel Orca profile authentication on this host',
    usage: 'orca profile auth cancel [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['profile', 'auth', 'refresh'],
    summary: 'refresh Orca profile authentication on this host',
    usage: 'orca profile auth refresh [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['profile', 'auth', 'sign-out'],
    summary: 'sign-out Orca profile authentication on this host',
    usage: 'orca profile auth sign-out --confirm true [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'confirm'],
    destructive: true
  },
  {
    path: ['profile', 'auth', 'select-org'],
    summary: 'Select the organization for the current Orca profile',
    usage: 'orca profile auth select-org --org-id <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'org-id']
  }
]
