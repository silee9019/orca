import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_GITHUB_PROJECT_COMMAND_SPECS_2: CommandSpec[] = [
  {
    path: ['github', 'project', 'update-issue-by-slug'],
    summary: 'Github project update issue by slug on the selected Orca runtime',
    usage: 'orca github project update-issue-by-slug --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: owner, repo, host (optional), number, updates.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the SlugIssueUpdate parameters from github-project-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'project', 'update-pull-request-by-slug'],
    summary: 'Github project update pull request by slug on the selected Orca runtime',
    usage: 'orca github project update-pull-request-by-slug --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: owner, repo, host (optional), number, updates.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the SlugPullRequestUpdate parameters from github-project-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'project', 'update-issue-type-by-slug'],
    summary: 'Github project update issue type by slug on the selected Orca runtime',
    usage: 'orca github project update-issue-type-by-slug --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: owner, repo, host (optional), number, issueTypeId.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the SlugIssueTypeUpdate parameters from github-project-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'project', 'add-issue-comment-by-slug'],
    summary: 'Github project add issue comment by slug on the selected Orca runtime',
    usage: 'orca github project add-issue-comment-by-slug --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: owner, repo, host (optional), number, body.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the SlugIssueComment parameters from github-project-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'project', 'update-issue-comment-by-slug'],
    summary: 'Github project update issue comment by slug on the selected Orca runtime',
    usage: 'orca github project update-issue-comment-by-slug --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: owner, repo, host (optional), commentId, body.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the SlugIssueCommentEdit parameters from github-project-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'project', 'delete-issue-comment-by-slug'],
    summary: 'Github project delete issue comment by slug on the selected Orca runtime',
    usage:
      'orca github project delete-issue-comment-by-slug --params-file <file|-> --confirm <target> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'Input fields: owner, repo, host (optional), commentId.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the SlugIssueCommentDelete parameters from github-project-params. Use --params-file - to read stdin. No inline credential arguments.',
      '--confirm must exactly match owner/repo:commentId.'
    ],
    destructive: true
  }
]
