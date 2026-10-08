import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_GITHUB_WORK_ITEMS_COMMAND_SPECS_1: CommandSpec[] = [
  {
    path: ['github', 'repo-slug'],
    summary: 'Github repo slug on the selected Orca runtime',
    usage: 'orca github repo-slug --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the RepoSelector parameters from github-repo-target-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'repo-upstream'],
    summary: 'Github repo upstream on the selected Orca runtime',
    usage: 'orca github repo-upstream --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the RepoSelector parameters from github-repo-target-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'rate-limit'],
    summary: 'Github rate limit on the selected Orca runtime',
    usage: 'orca github rate-limit --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: force (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the RateLimit parameters from github-repo-work-item-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'list-work-items'],
    summary: 'Github list work items on the selected Orca runtime',
    usage: 'orca github list-work-items --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, limit (optional), query (optional), page (optional), noCache (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the WorkItemsList parameters from github-repo-work-item-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'list-issues'],
    summary: 'Github list issues on the selected Orca runtime',
    usage: 'orca github list-issues --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, limit (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the IssuesList parameters from github-repo-work-item-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'count-work-items'],
    summary: 'Github count work items on the selected Orca runtime',
    usage: 'orca github count-work-items --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, query (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the WorkItemsCount parameters from github-repo-work-item-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'list-labels'],
    summary: 'Github list labels on the selected Orca runtime',
    usage: 'orca github list-labels --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the RepoSelector parameters from github-repo-target-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'list-assignable-users'],
    summary: 'Github list assignable users on the selected Orca runtime',
    usage: 'orca github list-assignable-users --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the RepoSelector parameters from github-repo-target-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'work-item'],
    summary: 'Github work item on the selected Orca runtime',
    usage: 'orca github work-item --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, number, type (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the WorkItem parameters from github-repo-work-item-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'work-item-by-owner-repo'],
    summary: 'Github work item by owner repo on the selected Orca runtime',
    usage: 'orca github work-item-by-owner-repo --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, owner, ownerRepo, host (optional), number, type.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the WorkItemByOwnerRepo parameters from github-repo-work-item-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  }
]
