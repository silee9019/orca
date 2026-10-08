import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_JIRA_COMMAND_SPECS_2: CommandSpec[] = [
  {
    path: ['jira', 'issue-comments'],
    summary: 'Jira issue comments on the selected Orca runtime',
    usage: 'orca jira issue-comments --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: key, siteId (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the IssueKey parameters from jira-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['jira', 'list-projects'],
    summary: 'Jira list projects on the selected Orca runtime',
    usage: 'orca jira list-projects --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: siteId (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the SiteSelection parameters from jira-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['jira', 'list-issue-types'],
    summary: 'Jira list issue types on the selected Orca runtime',
    usage: 'orca jira list-issue-types --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: projectIdOrKey, siteId (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the ProjectIssueTypes parameters from jira-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['jira', 'list-create-fields'],
    summary: 'Jira list create fields on the selected Orca runtime',
    usage: 'orca jira list-create-fields --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: projectIdOrKey, issueTypeId, siteId (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the ProjectIssueTypeFields parameters from jira-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['jira', 'list-priorities'],
    summary: 'Jira list priorities on the selected Orca runtime',
    usage: 'orca jira list-priorities --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: siteId (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the SiteSelection parameters from jira-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['jira', 'list-assignable-users'],
    summary: 'Jira list assignable users on the selected Orca runtime',
    usage: 'orca jira list-assignable-users --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: key, query (optional), siteId (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the AssignableUsers parameters from jira-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['jira', 'search-users'],
    summary: 'Jira search users on the selected Orca runtime',
    usage: 'orca jira search-users --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: query (optional), siteId (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the UserSearch parameters from jira-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['jira', 'list-transitions'],
    summary: 'Jira list transitions on the selected Orca runtime',
    usage: 'orca jira list-transitions --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: key, siteId (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the IssueKey parameters from jira-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['jira', 'get-project-status-order'],
    summary: 'Jira get project status order on the selected Orca runtime',
    usage: 'orca jira get-project-status-order --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: projectKey, siteId (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the ProjectStatusOrder parameters from jira-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  }
]
