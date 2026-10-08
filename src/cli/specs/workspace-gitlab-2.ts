import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_GITLAB_COMMAND_SPECS_2: CommandSpec[] = [
  {
    path: ['gitlab', 'add-mr-comment'],
    summary: 'Gitlab add mr comment on the selected Orca runtime',
    usage: 'orca gitlab add-mr-comment --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, iid, body, projectRef (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the AddMRComment parameters from gitlab-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['gitlab', 'add-mr-inline-comment'],
    summary: 'Gitlab add mr inline comment on the selected Orca runtime',
    usage: 'orca gitlab add-mr-inline-comment --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, iid, input, projectRef (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the AddMRInlineComment parameters from gitlab-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['gitlab', 'resolve-mr-discussion'],
    summary: 'Gitlab resolve mr discussion on the selected Orca runtime',
    usage: 'orca gitlab resolve-mr-discussion --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, iid, discussionId, resolved, projectRef (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the ResolveMRDiscussion parameters from gitlab-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['gitlab', 'job-trace'],
    summary: 'Gitlab job trace on the selected Orca runtime',
    usage: 'orca gitlab job-trace --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, jobId, projectRef (optional), logExcerpt (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the JobTrace parameters from gitlab-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['gitlab', 'retry-job'],
    summary: 'Gitlab retry job on the selected Orca runtime',
    usage: 'orca gitlab retry-job --params-file <file|-> --confirm <target> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'Input fields: repo, jobId, projectRef (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the RetryJob parameters from gitlab-params. Use --params-file - to read stdin. No inline credential arguments.',
      '--confirm must exactly match `${repo}:${jobId}`.'
    ],
    destructive: true
  },
  {
    path: ['gitlab', 'merge-mr'],
    summary: 'Gitlab merge mr on the selected Orca runtime',
    usage: 'orca gitlab merge-mr --params-file <file|-> --confirm <target> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'Input fields: repo, iid, method (optional), projectRef (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the MergeMr parameters from gitlab-params. Use --params-file - to read stdin. No inline credential arguments.',
      '--confirm must exactly match `${repo}:${iid}`.'
    ],
    destructive: true
  },
  {
    path: ['gitlab', 'update-mr-state'],
    summary: 'Gitlab update mr state on the selected Orca runtime',
    usage: 'orca gitlab update-mr-state --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, iid, state, projectRef (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the UpdateMrState parameters from gitlab-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['gitlab', 'update-mr'],
    summary: 'Gitlab update mr on the selected Orca runtime',
    usage: 'orca gitlab update-mr --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, iid, updates, projectRef (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the UpdateMr parameters from gitlab-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['gitlab', 'update-mr-reviewers'],
    summary: 'Gitlab update mr reviewers on the selected Orca runtime',
    usage: 'orca gitlab update-mr-reviewers --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, iid, reviewerIds, projectRef (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the UpdateMrReviewers parameters from gitlab-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['gitlab', 'work-item-details'],
    summary: 'Gitlab work item details on the selected Orca runtime',
    usage: 'orca gitlab work-item-details --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, iid, type, projectRef (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the WorkItemDetails parameters from gitlab-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  }
]
