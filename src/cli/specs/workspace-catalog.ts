import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_CATALOG_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['worktree', 'detected'],
    summary: 'List detected workspaces and their ownership',
    usage: 'orca worktree detected --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo.',
      'The selected Orca runtime resolves native, SSH and paired-host workspace identities. Unavailable hosts fail without running on the CLI machine.',
      'Pass command parameters as a JSON file, or --params-file - for stdin. Existing host validation and permissions apply.'
    ]
  },
  {
    path: ['worktree', 'retired-names'],
    summary: 'List retired workspace names',
    usage: 'orca worktree retired-names --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo.',
      'The selected Orca runtime resolves native, SSH and paired-host workspace identities. Unavailable hosts fail without running on the CLI machine.',
      'Pass command parameters as a JSON file, or --params-file - for stdin. Existing host validation and permissions apply.'
    ]
  },
  {
    path: ['worktree', 'lineage'],
    summary: 'List workspace parent relationships',
    usage: 'orca worktree lineage [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'The selected Orca runtime resolves native, SSH and paired-host workspace identities. Unavailable hosts fail without running on the CLI machine.'
    ]
  },
  {
    path: ['worktree', 'reorder'],
    summary: 'Save workspace order',
    usage: 'orca worktree reorder --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: orderedIds.',
      'The selected Orca runtime resolves native, SSH and paired-host workspace identities. Unavailable hosts fail without running on the CLI machine.',
      'Pass command parameters as a JSON file, or --params-file - for stdin. Existing host validation and permissions apply.'
    ]
  },
  {
    path: ['worktree', 'resolve-pr-base'],
    summary: 'Resolve a GitHub review base',
    usage: 'orca worktree resolve-pr-base --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, prNumber, headRefName (optional), baseRefName (optional), isCrossRepository (optional).',
      'The selected Orca runtime resolves native, SSH and paired-host workspace identities. Unavailable hosts fail without running on the CLI machine.',
      'Pass command parameters as a JSON file, or --params-file - for stdin. Existing host validation and permissions apply.'
    ]
  },
  {
    path: ['worktree', 'resolve-mr-base'],
    summary: 'Resolve a GitLab review base',
    usage: 'orca worktree resolve-mr-base --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, mrIid, sourceBranch (optional), targetBranch (optional), isCrossRepository (optional).',
      'The selected Orca runtime resolves native, SSH and paired-host workspace identities. Unavailable hosts fail without running on the CLI machine.',
      'Pass command parameters as a JSON file, or --params-file - for stdin. Existing host validation and permissions apply.'
    ]
  },
  {
    path: ['worktree', 'prefetch-base'],
    summary: 'Prefetch the workspace creation base',
    usage: 'orca worktree prefetch-base --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, baseBranch (optional).',
      'The selected Orca runtime resolves native, SSH and paired-host workspace identities. Unavailable hosts fail without running on the CLI machine.',
      'Pass command parameters as a JSON file, or --params-file - for stdin. Existing host validation and permissions apply.'
    ]
  },
  {
    path: ['worktree', 'delete-preserved-branch'],
    summary: 'Delete a preserved branch at its expected head',
    usage:
      'orca worktree delete-preserved-branch --params-file <file|-> --confirm <target> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'Input fields: worktree, hostId (optional), branchName, expectedHead.',
      'The selected Orca runtime resolves native, SSH and paired-host workspace identities. Unavailable hosts fail without running on the CLI machine.',
      'Pass command parameters as a JSON file, or --params-file - for stdin. Existing host validation and permissions apply.',
      'hostId is required. --confirm must equal worktree:hostId:branchName:expectedHead. The existing host service rejects a changed branch head and checks preserved-branch ownership.'
    ],
    destructive: true
  }
]
