import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_GITHUB_REVIEW_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['github', 'update-pr-title'],
    summary: 'Github update pr title on the selected Orca runtime',
    usage: 'orca github update-pr-title --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, prNumber, title, prRepo (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the UpdatePrTitle parameters from github-pull-request-update-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'update-pr'],
    summary: 'Github update pr on the selected Orca runtime',
    usage: 'orca github update-pr --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, prNumber, updates, prRepo (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the UpdatePr parameters from github-pull-request-update-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'merge-pr'],
    summary: 'Github merge pr on the selected Orca runtime',
    usage: 'orca github merge-pr --params-file <file|-> --confirm <target> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'Input fields: repo, prNumber, method (optional), prRepo (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the MergePr parameters from github-pull-request-update-params. Use --params-file - to read stdin. No inline credential arguments.',
      '--confirm must exactly match `${repo}:${prNumber}`.'
    ],
    destructive: true
  },
  {
    path: ['github', 'set-pr-auto-merge'],
    summary: 'Github set pr auto merge on the selected Orca runtime',
    usage: 'orca github set-pr-auto-merge --params-file <file|-> --confirm <target> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'Input fields: repo, prNumber, enabled, method (optional), prRepo (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the SetPrAutoMerge parameters from github-pull-request-update-params. Use --params-file - to read stdin. No inline credential arguments.',
      '--confirm must exactly match `${repo}:${prNumber}`.'
    ],
    destructive: true
  },
  {
    path: ['github', 'update-pr-state'],
    summary: 'Github update pr state on the selected Orca runtime',
    usage: 'orca github update-pr-state --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, prNumber, prRepo (optional), updates.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the UpdatePrState parameters from github-pull-request-update-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'mark-pr-ready-for-review'],
    summary: 'Github mark pr ready for review on the selected Orca runtime',
    usage: 'orca github mark-pr-ready-for-review --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, prNumber, prRepo (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the MarkPrReadyForReview parameters from github-pull-request-update-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'request-pr-reviewers'],
    summary: 'Github request pr reviewers on the selected Orca runtime',
    usage: 'orca github request-pr-reviewers --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, prNumber, prRepo (optional), reviewers.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the RequestPrReviewers parameters from github-pull-request-update-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'remove-pr-reviewers'],
    summary: 'Github remove pr reviewers on the selected Orca runtime',
    usage: 'orca github remove-pr-reviewers --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, prNumber, prRepo (optional), reviewers.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the RemovePrReviewers parameters from github-pull-request-update-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'add-pr-review-comment'],
    summary: 'Github add pr review comment on the selected Orca runtime',
    usage: 'orca github add-pr-review-comment --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, prNumber, prRepo (optional), commitId, path, line, startLine (optional), body.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the PRReviewComment parameters from github-pull-request-update-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'add-pr-review-comment-reply'],
    summary: 'Github add pr review comment reply on the selected Orca runtime',
    usage: 'orca github add-pr-review-comment-reply --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, prNumber, commentId, body, threadId (optional), path (optional), line (optional), prRepo (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the PRReviewCommentReply parameters from github-pull-request-update-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  }
]
