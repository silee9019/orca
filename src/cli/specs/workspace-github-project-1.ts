import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_GITHUB_PROJECT_COMMAND_SPECS_1: CommandSpec[] = [
  {
    path: ['github', 'project', 'list-accessible'],
    summary: 'Github project list accessible on the selected Orca runtime',
    usage: 'orca github project list-accessible --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: host (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the GithubProjectListAccessibleParams parameters from github-project-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'project', 'list-labels-by-slug'],
    summary: 'Github project list labels by slug on the selected Orca runtime',
    usage: 'orca github project list-labels-by-slug --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: owner, repo, host (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the SlugRepo parameters from github-repo-target-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'project', 'list-assignable-users-by-slug'],
    summary: 'Github project list assignable users by slug on the selected Orca runtime',
    usage: 'orca github project list-assignable-users-by-slug --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: owner, repo, host (optional), seedLogins (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the SlugAssignableUsers parameters from github-project-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'project', 'list-issue-types-by-slug'],
    summary: 'Github project list issue types by slug on the selected Orca runtime',
    usage: 'orca github project list-issue-types-by-slug --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: owner, repo, host (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the SlugRepo parameters from github-repo-target-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'project', 'resolve-ref'],
    summary: 'Github project resolve ref on the selected Orca runtime',
    usage: 'orca github project resolve-ref --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: input, host (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the ProjectRef parameters from github-project-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'project', 'list-views'],
    summary: 'Github project list views on the selected Orca runtime',
    usage: 'orca github project list-views --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: owner, host (optional), ownerType, projectNumber.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the ProjectViews parameters from github-project-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'project', 'view-table'],
    summary: 'Github project view table on the selected Orca runtime',
    usage: 'orca github project view-table --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: owner, host (optional), ownerType, projectNumber, viewId (optional), viewNumber (optional), viewName (optional), queryOverride (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the ProjectViewTable parameters from github-project-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'project', 'work-item-details-by-slug'],
    summary: 'Github project work item details by slug on the selected Orca runtime',
    usage: 'orca github project work-item-details-by-slug --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: owner, repo, host (optional), number, type.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the ProjectWorkItemDetailsBySlug parameters from github-project-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'project', 'update-item-field'],
    summary: 'Github project update item field on the selected Orca runtime',
    usage: 'orca github project update-item-field --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: projectId, host (optional), itemId, fieldId, value (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the ProjectItemField parameters from github-project-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'project', 'clear-item-field'],
    summary: 'Github project clear item field on the selected Orca runtime',
    usage: 'orca github project clear-item-field --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: projectId, host (optional), itemId, fieldId.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the ClearProjectItemField parameters from github-project-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  }
]
