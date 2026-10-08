import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_LINEAR_DATA_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['linear', 'project', 'create'],
    summary: 'Create a project in a concrete Linear workspace',
    usage:
      'orca linear project create --params-file <file|-> --confirm <workspaceId:name> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'Input fields: workspaceId, name, teamIds, description (optional), content (optional), leadId (optional), memberIds (optional), labelIds (optional), priority (optional), startDate (optional), targetDate (optional).',
      'Pass CreateProject JSON in a file or --params-file - for stdin. workspaceId must name one workspace; all is rejected. --confirm must exactly match workspaceId:name.',
      'The selected Orca runtime uses its existing Linear connection and project service. Older hosts fail without another host fallback.'
    ]
  },
  {
    path: ['linear', 'issue-comments'],
    summary: 'Linear issue comments on the selected Orca runtime',
    usage: 'orca linear issue-comments --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: issueId, workspaceId (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the LinearIssueCommentsParams parameters from linear-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['linear', 'project', 'get'],
    summary: 'Linear project get on the selected Orca runtime',
    usage: 'orca linear project get --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: id, workspaceId, force (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the ProjectId parameters from linear-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['linear', 'list-project-issues'],
    summary: 'Linear list project issues on the selected Orca runtime',
    usage: 'orca linear list-project-issues --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: projectId, limit (optional), workspaceId, force (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the ProjectIssues parameters from linear-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['linear', 'list-custom-views'],
    summary: 'Linear list custom views on the selected Orca runtime',
    usage: 'orca linear list-custom-views --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: model, limit (optional), workspaceId (optional), force (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the ListCustomViews parameters from linear-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['linear', 'get-custom-view'],
    summary: 'Linear get custom view on the selected Orca runtime',
    usage: 'orca linear get-custom-view --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: viewId, model, workspaceId, force (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the CustomViewId parameters from linear-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['linear', 'list-custom-view-issues'],
    summary: 'Linear list custom view issues on the selected Orca runtime',
    usage: 'orca linear list-custom-view-issues --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: viewId, limit (optional), workspaceId, force (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the CustomViewContents parameters from linear-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['linear', 'list-custom-view-projects'],
    summary: 'Linear list custom view projects on the selected Orca runtime',
    usage: 'orca linear list-custom-view-projects --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: viewId, limit (optional), workspaceId, force (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the CustomViewContents parameters from linear-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  }
]
