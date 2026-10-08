import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_PROJECT_GROUP_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['project-group', 'list'],
    summary: 'Project group list on the selected Orca runtime',
    usage: 'orca project-group list [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.'
    ]
  },
  {
    path: ['project-group', 'create'],
    summary: 'Project group create on the selected Orca runtime',
    usage: 'orca project-group create --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: name, parentPath (optional), connectionId (optional), parentGroupId (optional), createdFrom (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the ProjectGroupCreate parameters from repo-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['project-group', 'update'],
    summary: 'Project group update on the selected Orca runtime',
    usage: 'orca project-group update --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: groupId, updates.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the ProjectGroupUpdate parameters from repo-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['project-group', 'delete'],
    aliases: [['project-group', 'rm']],
    summary: 'Project group delete on the selected Orca runtime',
    usage: 'orca project-group delete --params-file <file|-> --confirm <target> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'Input fields: groupId.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the ProjectGroupSelector parameters from repo-params. Use --params-file - to read stdin. No inline credential arguments.',
      '--confirm must exactly match groupId.'
    ],
    destructive: true
  },
  {
    path: ['project-group', 'move-project'],
    summary: 'Project group move project on the selected Orca runtime',
    usage: 'orca project-group move-project --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, groupId (optional), order (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the ProjectGroupMoveProject parameters from repo-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['project-group', 'scan-nested'],
    summary: 'Project group scan nested on the selected Orca runtime',
    usage: 'orca project-group scan-nested --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: path.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the ProjectGroupScanNested parameters from repo-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['project-group', 'import-nested'],
    summary: 'Project group import nested on the selected Orca runtime',
    usage: 'orca project-group import-nested --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the ProjectGroupImportNested parameters from repo-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  }
]
