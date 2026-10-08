import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_REPO_DATA_COMMAND_SPECS: CommandSpec[] = [
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
