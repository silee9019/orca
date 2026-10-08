import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_GITHUB_REVIEW_READ_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['github', 'pr-for-branch'],
    summary: 'Github pr for branch on the selected Orca runtime',
    usage: 'orca github pr-for-branch --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, branch, reason (optional), linkedPRNumber (optional), fallbackPRNumber (optional), acceptMergedFallbackPR (optional), currentHeadOid (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the PrForBranch parameters from github-pull-request-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'pr-checks'],
    summary: 'Github pr checks on the selected Orca runtime',
    usage: 'orca github pr-checks --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, prNumber, noCache (optional), prRepo (optional), headSha (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the PullRequestChecks parameters from github-pull-request-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'pr-check-details'],
    summary: 'Github pr check details on the selected Orca runtime',
    usage: 'orca github pr-check-details --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, checkRunId (optional), workflowRunId (optional), checkName (optional), url (optional), prRepo (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the PullRequestCheckDetails parameters from github-pull-request-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'rerun-pr-checks'],
    summary: 'Github rerun pr checks on the selected Orca runtime',
    usage: 'orca github rerun-pr-checks --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, prNumber, noCache (optional), prRepo (optional), headSha (optional), failedOnly (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the RerunPullRequestChecks parameters from github-pull-request-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'pr-comments'],
    summary: 'Github pr comments on the selected Orca runtime',
    usage: 'orca github pr-comments --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, prNumber, noCache (optional), prRepo (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the PullRequest parameters from github-pull-request-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'set-pr-comment-reaction'],
    summary: 'Github set pr comment reaction on the selected Orca runtime',
    usage: 'orca github set-pr-comment-reaction --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, reactionSubjectId, content, reacted, prRepo (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the PRCommentReaction parameters from github-pull-request-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'pr-file-contents'],
    summary: 'Github pr file contents on the selected Orca runtime',
    usage: 'orca github pr-file-contents --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, prNumber, prRepo (optional), path, oldPath (optional), status, headSha, baseSha.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the PullRequestFileContents parameters from github-pull-request-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'resolve-review-thread'],
    summary: 'Github resolve review thread on the selected Orca runtime',
    usage: 'orca github resolve-review-thread --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, prRepo (optional), threadId, resolve.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the ReviewThread parameters from github-pull-request-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'set-pr-file-viewed'],
    summary: 'Github set pr file viewed on the selected Orca runtime',
    usage: 'orca github set-pr-file-viewed --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, prRepo (optional), pullRequestId, path, viewed.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the PullRequestFileViewed parameters from github-pull-request-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  }
]
