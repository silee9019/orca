import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_GITHUB_WORK_ITEMS_COMMAND_SPECS_2: CommandSpec[] = [
  {
    path: ['github', 'work-item-details'],
    summary: 'Github work item details on the selected Orca runtime',
    usage: 'orca github work-item-details --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, number, type (optional).',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the WorkItemDetails parameters from github-repo-work-item-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  },
  {
    path: ['github', 'list-bindable-accounts'],
    summary: 'Check repository account binding on the selected execution host',
    usage: 'orca github list-bindable-accounts --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, refreshCapability (optional).',
      'The selected runtime checks the repository account without changing the global account selection.',
      'Pass BindableAccounts JSON in a file or --params-file - for stdin. An older host returns method_not_found without another host fallback.'
    ]
  },
  {
    path: ['github', 'validate-account-binding'],
    summary: 'Check repository account binding on the selected execution host',
    usage: 'orca github validate-account-binding --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, host, user.',
      'The selected runtime checks the repository account without changing the global account selection.',
      'Pass ValidateAccountBinding JSON in a file or --params-file - for stdin. An older host returns method_not_found without another host fallback.'
    ]
  }
]
