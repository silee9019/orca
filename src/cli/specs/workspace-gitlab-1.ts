import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_GITLAB_COMMAND_SPECS_1: CommandSpec[] = [
  {
    path: ['gitlab', 'list-mrs'],
    summary: 'Gitlab list m rs on the selected Orca runtime',
    usage: 'orca gitlab list-mrs --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, state (optional), page (optional), perPage (optional), query (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the WorkItemsList parameters from gitlab-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['gitlab', 'list-work-items'],
    summary: 'Gitlab list work items on the selected Orca runtime',
    usage: 'orca gitlab list-work-items --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, state (optional), page (optional), perPage (optional), query (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the WorkItemsList parameters from gitlab-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['gitlab', 'list-issues'],
    summary: 'Gitlab list issues on the selected Orca runtime',
    usage: 'orca gitlab list-issues --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, state (optional), assignee (optional), limit (optional), page (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the IssuesList parameters from gitlab-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['gitlab', 'todos'],
    summary: 'Gitlab todos on the selected Orca runtime',
    usage: 'orca gitlab todos --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the RepoSelector parameters from gitlab-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['gitlab', 'diagnose-auth'],
    summary: 'Gitlab diagnose auth on the selected Orca runtime',
    usage: 'orca gitlab diagnose-auth --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: .',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the EmptyParams parameters from gitlab-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['gitlab', 'rate-limit'],
    summary: 'Gitlab rate limit on the selected Orca runtime',
    usage: 'orca gitlab rate-limit --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: force (optional), host (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the GitLabRateLimit parameters from gitlab-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['gitlab', 'list-labels'],
    summary: 'Gitlab list labels on the selected Orca runtime',
    usage: 'orca gitlab list-labels --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the RepoSelector parameters from gitlab-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['gitlab', 'create-issue'],
    summary: 'Gitlab create issue on the selected Orca runtime',
    usage: 'orca gitlab create-issue --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, title, body.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the CreateIssue parameters from gitlab-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['gitlab', 'update-issue'],
    summary: 'Gitlab update issue on the selected Orca runtime',
    usage: 'orca gitlab update-issue --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, number, updates, projectRef (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the UpdateIssue parameters from gitlab-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['gitlab', 'add-issue-comment'],
    summary: 'Gitlab add issue comment on the selected Orca runtime',
    usage: 'orca gitlab add-issue-comment --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, number, body, projectRef (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the AddIssueComment parameters from gitlab-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  }
]
