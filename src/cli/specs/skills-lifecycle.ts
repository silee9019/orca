import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const SKILL_LIFECYCLE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['skills', 'freshness'],
    summary: 'freshness on the selected runtime',
    usage: 'orca skills freshness [--json]',
    notes: [
      'Global updates operate on the runtime machine, using the same update runner as the desktop. Native-host global scope only; SSH and WSL inventories are excluded by the existing inventory policy.'
    ],
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['skills', 'update-status'],
    summary: 'update-status on the selected runtime',
    usage: 'orca skills update-status [--json]',
    notes: [
      'Global updates operate on the runtime machine, using the same update runner as the desktop. Native-host global scope only; SSH and WSL inventories are excluded by the existing inventory policy.'
    ],
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['skills', 'update-cancel'],
    summary: 'update-cancel on the selected runtime',
    usage: 'orca skills update-cancel [--json]',
    notes: [
      'Global updates operate on the runtime machine, using the same update runner as the desktop. Native-host global scope only; SSH and WSL inventories are excluded by the existing inventory policy.'
    ],
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['skills', 'update-acknowledge'],
    summary: 'update-acknowledge on the selected runtime',
    usage: 'orca skills update-acknowledge [--json]',
    notes: [
      'Global updates operate on the runtime machine, using the same update runner as the desktop. Native-host global scope only; SSH and WSL inventories are excluded by the existing inventory policy.'
    ],
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['skills', 'wsl-distros'],
    summary: 'wsl-distros on the selected runtime',
    usage: 'orca skills wsl-distros [--json]',
    notes: [
      'Global updates operate on the runtime machine, using the same update runner as the desktop. Native-host global scope only; SSH and WSL inventories are excluded by the existing inventory policy.'
    ],
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['skills', 'prepare-share'],
    summary: 'Preview and prepare exact discovered skills for publishing',
    usage: 'orca skills prepare-share --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'JSON is validated against the same request schema as the runtime before dispatch.',
      'Select the execution runtime with --environment. Include the explicit discovery or install target in the request; no fallback to the CLI filesystem occurs.',
      'Sharing and external account permissions remain enforced by the runtime. This command does not change those permissions.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['skills', 'publish-share'],
    summary: 'Publish an exact prepared share',
    usage: 'orca skills publish-share --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'JSON is validated against the same request schema as the runtime before dispatch.',
      'Select the execution runtime with --environment. Include the explicit discovery or install target in the request; no fallback to the CLI filesystem occurs.',
      'Sharing and external account permissions remain enforced by the runtime. This command does not change those permissions.'
    ],
    destructive: true,
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['skills', 'cancel-share'],
    summary: 'Cancel publishing an exact prepared share',
    usage: 'orca skills cancel-share --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'JSON is validated against the same request schema as the runtime before dispatch.',
      'Select the execution runtime with --environment. Include the explicit discovery or install target in the request; no fallback to the CLI filesystem occurs.',
      'Sharing and external account permissions remain enforced by the runtime. This command does not change those permissions.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['skills', 'release-share'],
    summary: 'Release an exact prepared share archive',
    usage: 'orca skills release-share --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'JSON is validated against the same request schema as the runtime before dispatch.',
      'Select the execution runtime with --environment. Include the explicit discovery or install target in the request; no fallback to the CLI filesystem occurs.',
      'Sharing and external account permissions remain enforced by the runtime. This command does not change those permissions.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['skills', 'update-start'],
    summary: 'Start the existing targeted global updater',
    usage: 'orca skills update-start --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'JSON is validated against the same request schema as the runtime before dispatch.',
      'Select the execution runtime with --environment. Include the explicit discovery or install target in the request; no fallback to the CLI filesystem occurs.',
      'Sharing and external account permissions remain enforced by the runtime. This command does not change those permissions.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  }
]
