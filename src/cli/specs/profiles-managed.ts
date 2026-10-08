import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const MANAGED_PROFILE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['profile', 'create'],
    summary: 'create on the selected runtime profile',
    usage: 'orca profile create --input-file <request.json> | --input-stdin [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['profile', 'create-cloud'],
    summary: 'create-cloud on the selected runtime profile',
    usage: 'orca profile create-cloud --input-file <request.json> | --input-stdin [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['profile', 'use'],
    summary: 'use on the selected runtime profile',
    usage: 'orca profile use --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'Use, transfer-project, sign-out and auth-start require currentProfileId from profile list, preventing accidental changes after a profile switch.',
      'Use and active-project moves commit the profile change and relaunch the runtime. Run only against the intended isolated profile.'
    ],
    destructive: true,
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['profile', 'transfer-project'],
    summary: 'transfer-project on the selected runtime profile',
    usage: 'orca profile transfer-project --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'Use, transfer-project, sign-out and auth-start require currentProfileId from profile list, preventing accidental changes after a profile switch.',
      'Use and active-project moves commit the profile change and relaunch the runtime. Run only against the intended isolated profile.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['profile', 'find-projects'],
    summary: 'find-projects on the selected runtime profile',
    usage: 'orca profile find-projects --input-file <request.json> | --input-stdin [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['profile', 'auth-start'],
    summary: 'auth-start on the selected runtime profile',
    usage: 'orca profile auth-start --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'Auth-start returns an operation ID. Read auth-operation for the authorization URL, open it manually on the runtime host, and wait for complete. Auth-cancel closes its loopback listener.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['profile', 'sign-out'],
    summary: 'sign-out on the selected runtime profile',
    usage: 'orca profile sign-out --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'Use, transfer-project, sign-out and auth-start require currentProfileId from profile list, preventing accidental changes after a profile switch.'
    ],
    destructive: true,
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['profile', 'select-org'],
    summary: 'select-org on the selected runtime profile',
    usage: 'orca profile select-org --input-file <request.json> | --input-stdin [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['profile', 'org', 'members'],
    summary: 'org members on the selected runtime profile',
    usage: 'orca profile org members --input-file <request.json> | --input-stdin [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['profile', 'org', 'invite'],
    summary: 'org invite on the selected runtime profile',
    usage: 'orca profile org invite --input-file <request.json> | --input-stdin [--json]',
    destructive: true,
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['profile', 'org', 'revoke-invite'],
    summary: 'org revoke-invite on the selected runtime profile',
    usage: 'orca profile org revoke-invite --input-file <request.json> | --input-stdin [--json]',
    destructive: true,
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['profile', 'org', 'set-role'],
    summary: 'org set-role on the selected runtime profile',
    usage: 'orca profile org set-role --input-file <request.json> | --input-stdin [--json]',
    destructive: true,
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['profile', 'org', 'remove-member'],
    summary: 'org remove-member on the selected runtime profile',
    usage: 'orca profile org remove-member --input-file <request.json> | --input-stdin [--json]',
    destructive: true,
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['profile', 'list'],
    summary: 'list for the selected runtime',
    usage: 'orca profile list [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['profile', 'auth-status'],
    summary: 'auth-status for the selected runtime',
    usage: 'orca profile auth-status [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['profile', 'refresh-auth'],
    summary: 'refresh-auth for the selected runtime',
    usage: 'orca profile refresh-auth [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['profile', 'auth-operation'],
    summary: 'auth-operation for an exact authentication operation',
    usage: 'orca profile auth-operation --operation <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'operation']
  },
  {
    path: ['profile', 'auth-cancel'],
    summary: 'auth-cancel for an exact authentication operation',
    usage: 'orca profile auth-cancel --operation <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'operation']
  }
]
