import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_GITHUB_ISSUE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['github', 'issue'],
    summary: 'Github issue on the selected Orca runtime',
    usage: 'orca github issue --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, number.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the Issue parameters from github-issue-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'create-issue'],
    summary: 'Github create issue on the selected Orca runtime',
    usage: 'orca github create-issue --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, title, body, labels (optional), assignees (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the CreateIssue parameters from github-issue-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'update-issue'],
    summary: 'Github update issue on the selected Orca runtime',
    usage: 'orca github update-issue --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, number, updates.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the UpdateIssue parameters from github-issue-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'add-issue-comment'],
    summary: 'Github add issue comment on the selected Orca runtime',
    usage: 'orca github add-issue-comment --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, number, body, type (optional), prRepo (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the IssueComment parameters from github-issue-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  }
]
