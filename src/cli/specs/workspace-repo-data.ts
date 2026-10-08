import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_REPO_DATA_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['repo', 'search-base-refs'],
    summary: 'Search base refs and their local branch names on an explicit host',
    usage: 'orca repo search-base-refs --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {repoId, hostId, query, limit?}. Empty query is allowed. Uses the desktop default limit and existing bounded Git search service.',
      'Returns refs, optional refDetails and truncated. Host selection preserves duplicate repo IDs; folder workspaces return empty results without Git.',
      'Qualified ref projection and host-specific Git capability fallback retain the existing runtime contract. Empty results alone do not prove host contact. Old hosts fail without searching locally.'
    ]
  },
  {
    path: ['repo', 'default-project-parent'],
    summary: 'Read the selected runtime native project creation directory',
    usage: 'orca repo default-project-parent [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Uses the existing native host setting and default-directory policy. No directory is created.',
      'The selected runtime owns settings and home-directory resolution. This does not choose an SSH child host directory; old hosts fail without using the CLI client home.'
    ]
  },
  {
    path: ['repo', 'remove-for-host'],
    summary: 'Forget a project registration on one execution host',
    usage: 'orca repo remove-for-host --params-file <file|-> --confirm <hostId:repoId> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    destructive: true,
    notes: [
      'Input: hostId and repoId, from a regular JSON file or stdin. --confirm must exactly match hostId:repoId.',
      'Uses the existing host-scoped project removal in the selected runtime store. Preserves the same repo ID on other hosts and does not delete files on disk.',
      'local, ssh:<target> and runtime:<environment> identities remain distinct. Old hosts fail without retrying a fleet-wide removal.'
    ]
  },
  {
    path: ['repo', 'reorder-for-host'],
    summary: 'Reorder project registrations on one execution host',
    usage: 'orca repo reorder-for-host --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input: hostId and orderedIds, from a regular JSON file or stdin.',
      'The order must be an exact permutation of the selected host registrations. A stale, incomplete or duplicate order fails without changing storage.',
      'Uses the existing store operation and preserves other hosts in their current slots. Old hosts fail without falling back to a global reorder.'
    ]
  },
  {
    path: ['repo', 'sparse-presets'],
    summary: 'Repo sparse presets on the selected Orca runtime',
    usage: 'orca repo sparse-presets --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the RepoSelector parameters from github-repo-target-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['repo', 'save-sparse-preset'],
    summary: 'Repo save sparse preset on the selected Orca runtime',
    usage: 'orca repo save-sparse-preset --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, id (optional), name, directories.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the RepoSparsePresetSave parameters from repo-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['repo', 'create'],
    summary: 'Repo create on the selected Orca runtime',
    usage: 'orca repo create --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: parentPath, name, kind (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the RepoCreate parameters from repo-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['repo', 'git-available'],
    summary: 'Repo git available on the selected Orca runtime',
    usage: 'orca repo git-available [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.'
    ]
  },
  {
    path: ['repo', 'clone'],
    summary: 'Repo clone on the selected Orca runtime',
    usage: 'orca repo clone --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: url, destination.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the RepoClone parameters from repo-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['repo', 'rm'],
    summary: 'Repo rm on the selected Orca runtime',
    usage: 'orca repo rm --params-file <file|-> --confirm <target> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'Input fields: repo.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the RepoSelector parameters from github-repo-target-params. Use --params-file - to read stdin. No inline credential arguments.',
      '--confirm must exactly match repo.'
    ],
    destructive: true
  },
  {
    path: ['repo', 'reorder'],
    summary: 'Repo reorder on the selected Orca runtime',
    usage: 'orca repo reorder --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: orderedIds.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the RepoReorder parameters from repo-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['repo', 'base-ref-default'],
    summary: 'Repo base ref default on the selected Orca runtime',
    usage: 'orca repo base-ref-default --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the RepoSelector parameters from github-repo-target-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  }
]
