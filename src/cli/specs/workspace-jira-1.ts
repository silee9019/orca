import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_JIRA_COMMAND_SPECS_1: CommandSpec[] = [
  {
    path: ['jira', 'status'],
    summary: 'Jira status on the selected Orca runtime',
    usage: 'orca jira status [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.'
    ]
  },
  {
    path: ['jira', 'read-status'],
    summary: 'Jira read status on the selected Orca runtime',
    usage: 'orca jira read-status [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.'
    ]
  },
  {
    path: ['jira', 'test-connection'],
    summary: 'Jira test connection on the selected Orca runtime',
    usage: 'orca jira test-connection --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: siteId (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the SiteSelection parameters from jira-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['jira', 'search-issues'],
    summary: 'Jira search issues on the selected Orca runtime',
    usage: 'orca jira search-issues --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: jql, limit (optional), siteId (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the SearchIssues parameters from jira-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['jira', 'list-issues'],
    summary: 'Jira list issues on the selected Orca runtime',
    usage: 'orca jira list-issues --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: filter (optional), limit (optional), siteId (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the ListIssues parameters from jira-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['jira', 'get-issue'],
    summary: 'Jira get issue on the selected Orca runtime',
    usage: 'orca jira get-issue --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: key, siteId (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the IssueKey parameters from jira-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['jira', 'lookup-issue-summary'],
    summary: 'Jira lookup issue summary on the selected Orca runtime',
    usage: 'orca jira lookup-issue-summary --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: key, siteId (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the IssueKey parameters from jira-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['jira', 'create-issue'],
    summary: 'Jira create issue on the selected Orca runtime',
    usage: 'orca jira create-issue --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: siteId (optional), projectId, issueTypeId, title, description (optional), customFields (optional), userFieldKeys (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the CreateIssue parameters from jira-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['jira', 'update-issue'],
    summary: 'Jira update issue on the selected Orca runtime',
    usage: 'orca jira update-issue --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: key, siteId (optional), updates.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the IssueUpdate parameters from jira-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['jira', 'add-issue-comment'],
    summary: 'Jira add issue comment on the selected Orca runtime',
    usage: 'orca jira add-issue-comment --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: key, body, siteId (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the IssueComment parameters from jira-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  }
]
