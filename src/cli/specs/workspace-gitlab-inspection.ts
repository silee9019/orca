import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_GITLAB_INSPECTION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['gitlab', 'viewer'],
    summary: 'Read the selected runtime GitLab account identity',
    usage: 'orca gitlab viewer --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Read JSON from a regular file or stdin with --params-file -. No inline credentials.',
      'The selected runtime owns credentials and registered repo resolution, including SSH and WSL execution. Missing repos or old-peer methods fail without local fallback.',
      'Viewer uses the selected runtime account; repo lookups use the registered repo host. Plain folder workspaces have no GitLab repository identity.',
      'Null and empty results retain the existing service contract and do not prove host connectivity.',
      'Input example: {}'
    ]
  },
  {
    path: ['gitlab', 'issue'],
    summary: 'Read the original GitLab issue summary',
    usage: 'orca gitlab issue --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Read JSON from a regular file or stdin with --params-file -. No inline credentials.',
      'The selected runtime owns credentials and registered repo resolution, including SSH and WSL execution. Missing repos or old-peer methods fail without local fallback.',
      'Viewer uses the selected runtime account; repo lookups use the registered repo host. Plain folder workspaces have no GitLab repository identity.',
      'Null and empty results retain the existing service contract and do not prove host connectivity.',
      'Input example: {"repo":"id:repo","number":7}'
    ]
  },
  {
    path: ['gitlab', 'mr'],
    summary: 'Read the original GitLab merge request summary',
    usage: 'orca gitlab mr --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Read JSON from a regular file or stdin with --params-file -. No inline credentials.',
      'The selected runtime owns credentials and registered repo resolution, including SSH and WSL execution. Missing repos or old-peer methods fail without local fallback.',
      'Viewer uses the selected runtime account; repo lookups use the registered repo host. Plain folder workspaces have no GitLab repository identity.',
      'Null and empty results retain the existing service contract and do not prove host connectivity.',
      'Input example: {"repo":"id:repo","iid":8}'
    ]
  },
  {
    path: ['gitlab', 'mr-for-branch'],
    summary: 'Find a GitLab merge request for a host branch',
    usage: 'orca gitlab mr-for-branch --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'An empty branch preserves explicit linkedMRIid lookup; provide the branch field even for a linked request.',
      'Read JSON from a regular file or stdin with --params-file -. No inline credentials.',
      'The selected runtime owns credentials and registered repo resolution, including SSH and WSL execution. Missing repos or old-peer methods fail without local fallback.',
      'Viewer uses the selected runtime account; repo lookups use the registered repo host. Plain folder workspaces have no GitLab repository identity.',
      'Null and empty results retain the existing service contract and do not prove host connectivity.',
      'Input example: {"repo":"id:repo","branch":"feature","linkedMRIid":8}'
    ]
  },
  {
    path: ['gitlab', 'project-slug'],
    summary: 'Resolve the GitLab project on the execution host',
    usage: 'orca gitlab project-slug --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Read JSON from a regular file or stdin with --params-file -. No inline credentials.',
      'The selected runtime owns credentials and registered repo resolution, including SSH and WSL execution. Missing repos or old-peer methods fail without local fallback.',
      'Viewer uses the selected runtime account; repo lookups use the registered repo host. Plain folder workspaces have no GitLab repository identity.',
      'Null and empty results retain the existing service contract and do not prove host connectivity.',
      'Input example: {"repo":"id:repo"}'
    ]
  },
  {
    path: ['gitlab', 'list-assignable-users'],
    summary: 'List GitLab project members available for assignment',
    usage: 'orca gitlab list-assignable-users --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Read JSON from a regular file or stdin with --params-file -. No inline credentials.',
      'The selected runtime owns credentials and registered repo resolution, including SSH and WSL execution. Missing repos or old-peer methods fail without local fallback.',
      'Viewer uses the selected runtime account; repo lookups use the registered repo host. Plain folder workspaces have no GitLab repository identity.',
      'Null and empty results retain the existing service contract and do not prove host connectivity.',
      'Input example: {"repo":"id:repo"}'
    ]
  }
]
