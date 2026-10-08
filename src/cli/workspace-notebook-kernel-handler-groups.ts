import type { HandlerGroup } from './handler-group-manifest'
export const WORKSPACE_NOTEBOOK_KERNEL_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'workspace-notebook-kernel',
    keys: [
      'notebook kernel-start',
      'notebook kernel-status',
      'notebook kernel-execute',
      'notebook kernel-interrupt',
      'notebook kernel-shutdown',
      'notebook kernel-frames'
    ],
    load: async () =>
      (await import('./handlers/workspace-notebook-kernel.js')).WORKSPACE_NOTEBOOK_KERNEL_HANDLERS
  }
]
