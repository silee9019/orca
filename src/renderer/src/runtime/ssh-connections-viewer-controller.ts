import type { SshTarget, SshConfigHostListResult } from '../../../shared/ssh-types'
import type {
  ConnectionsViewerRequest,
  SshConnectionsViewerResult,
  SshConnectionsViewerState
} from '../../../shared/connections-viewer'
import {
  SshConnectionsViewerParams,
  type SshViewerDraft,
  type SshViewerSurface
} from '../../../shared/rpc-contract/connections-viewer-params'
export type SshConnectionsViewerController = {
  read: () => SshConnectionsViewerState
  matchesDraft: (draft: SshViewerDraft) => boolean
  open: () => void
  edit: (targetId: string) => boolean
  cancel: () => void
  draft: (updates: SshViewerDraft) => void
  save: () => Promise<boolean>
  actions?: {
    connect: (id: string) => Promise<boolean>
    disconnect: (id: string) => Promise<boolean>
    test: (id: string) => Promise<boolean>
    import: () => Promise<SshTarget[] | null>
    matchesImported: (targets: SshTarget[]) => boolean
    matchesConnection: (operation: 'connect' | 'disconnect', id: string) => boolean
  }
  normalize?: () => SshViewerDraft | null
  config?: {
    open: () => Promise<SshConfigHostListResult | null>
    search: (query: string, refresh: boolean) => Promise<SshConfigHostListResult | null>
    select: (alias: string) => Promise<SshViewerDraft | null>
    importNew: () => Promise<'added' | 'already-synced' | 'failed'>
    matchesList: (result: SshConfigHostListResult, query: string) => boolean
  }
}
type AdvancedController = { read: () => boolean; set: (open: boolean) => void }
const controllers = {
  settings: new Set<SshConnectionsViewerController>(),
  'add-host': new Set<SshConnectionsViewerController>()
}
const advancedControllers = {
  settings: new Set<AdvancedController>(),
  'add-host': new Set<AdvancedController>()
}
export function mountSshAdvancedViewerController(
  controller: AdvancedController,
  surface: SshViewerSurface = 'settings'
): () => void {
  advancedControllers[surface].add(controller)
  return () => {
    advancedControllers[surface].delete(controller)
  }
}
export function readSshAdvancedViewerState(surface: SshViewerSurface = 'settings'): boolean | null {
  const entries = advancedControllers[surface]
  if (entries.size !== 1) {
    return null
  }
  return entries.values().next().value?.read() ?? null
}
export function mountSshConnectionsViewerController(
  controller: SshConnectionsViewerController,
  surface: SshViewerSurface = 'settings'
): () => void {
  controllers[surface].add(controller)
  return () => {
    controllers[surface].delete(controller)
  }
}
export async function applySshConnectionsViewerRequest(
  request: ConnectionsViewerRequest
): Promise<SshConnectionsViewerResult> {
  const parsed = SshConnectionsViewerParams.safeParse(request.command)
  if (!parsed.success) {
    throw new Error('invalid_connections_viewer_command')
  }
  const command = parsed.data
  if (!command.operation.startsWith('ssh.')) {
    throw new Error('connections_surface_mismatch')
  }
  const surface = command.surface ?? 'settings'
  const entries = controllers[surface]
  if (entries.size > 1) {
    throw new Error('connections_viewer_ambiguous')
  }
  const controller = entries.values().next().value
  if (!controller) {
    throw new Error('connections_surface_unavailable')
  }
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  const initial = controller.read()
  if (initial.saving && command.operation !== 'ssh.get') {
    throw new Error('ssh_save_in_progress')
  }
  if (
    initial.formOpen &&
    ['ssh.connect', 'ssh.disconnect', 'ssh.test', 'ssh.import'].includes(command.operation)
  ) {
    throw new Error('ssh_form_in_progress')
  }
  let persisted: boolean | null = null
  let loaded: SshConfigHostListResult | null = null
  let loadedQuery = ''
  let selected: SshViewerDraft | null = null
  let importedTargets: SshTarget[] | null = null
  let ownerSucceeded = true
  const expected: Partial<SshConnectionsViewerState> = {}
  switch (command.operation) {
    case 'ssh.get':
      break
    case 'ssh.connect':
    case 'ssh.disconnect':
    case 'ssh.test':
      if (!controller.actions) {
        throw new Error('connections_surface_unavailable')
      }
      if (command.operation === 'ssh.disconnect' && command.confirmTarget !== command.targetId) {
        throw new Error('confirm_target_mismatch')
      }
      ownerSucceeded = await (command.operation === 'ssh.connect'
        ? controller.actions.connect(command.targetId)
        : command.operation === 'ssh.disconnect'
          ? controller.actions.disconnect(command.targetId)
          : controller.actions.test(command.targetId))
      break
    case 'ssh.import':
      if (!controller.actions) {
        throw new Error('connections_surface_unavailable')
      }
      importedTargets = await controller.actions.import()
      persisted = importedTargets !== null
      ownerSucceeded = persisted
      break
    case 'ssh.form-open':
      controller.open()
      expected.formOpen = true
      expected.editingId = null
      break
    case 'ssh.form-edit':
      if (!controller.edit(command.targetId)) {
        throw new Error('ssh_target_not_found')
      }
      expected.formOpen = true
      expected.editingId = command.targetId
      break
    case 'ssh.form-cancel':
      controller.cancel()
      expected.formOpen = false
      expected.editingId = null
      break
    case 'ssh.form-draft':
      if (!initial.formOpen) {
        throw new Error('ssh_form_unavailable')
      }
      controller.draft(command.updates)
      break
    case 'ssh.form-normalize':
      if (!initial.formOpen) {
        throw new Error('ssh_form_unavailable')
      }
      selected = controller.normalize?.() ?? null
      if (!selected) {
        throw new Error('connections_surface_unavailable')
      }
      expected.formOpen = true
      break
    case 'ssh.form-save':
      if (!initial.formOpen) {
        throw new Error('ssh_form_unavailable')
      }
      persisted = await controller.save()
      if (!persisted) {
        return {
          viewerId: command.viewerId,
          persisted: false,
          applied: false,
          state: controller.read(),
          reason: 'ssh_save_failed'
        }
      }
      expected.formOpen = false
      expected.saving = false
      break
    case 'ssh.config-open':
    case 'ssh.config-search': {
      if (
        !controller.config ||
        (command.operation === 'ssh.config-open' ? !initial.formOpen : !initial.configPickerOpen)
      ) {
        throw new Error('ssh_config_picker_unavailable')
      }
      loadedQuery = command.operation === 'ssh.config-open' ? '' : command.query
      loaded =
        command.operation === 'ssh.config-open'
          ? await controller.config.open()
          : await controller.config.search(command.query, command.refresh ?? false)
      ownerSucceeded = loaded !== null
      expected.configPickerOpen = true
      expected.configLoading = false
      break
    }
    case 'ssh.config-select':
      if (!controller.config || !initial.configPickerOpen) {
        throw new Error('ssh_config_picker_unavailable')
      }
      selected = await controller.config.select(command.alias)
      ownerSucceeded = selected !== null
      expected.formOpen = true
      expected.configPickerOpen = false
      break
    case 'ssh.config-import-new': {
      if (!controller.config || !initial.configPickerOpen) {
        throw new Error('ssh_config_picker_unavailable')
      }
      const imported = await controller.config.importNew()
      ownerSucceeded = imported !== 'failed'
      persisted = imported === 'added' ? true : imported === 'failed' ? false : null
      expected.formOpen = false
      expected.configPickerOpen = imported === 'already-synced'
      expected.saving = false
      expected.configLoading = false
      break
    }
    case 'ssh.advanced':
      if (advancedControllers[surface].size > 1) {
        throw new Error('connections_viewer_ambiguous')
      }
      const advancedController = advancedControllers[surface].values().next().value
      if (!initial.formOpen || !advancedController) {
        throw new Error('ssh_form_unavailable')
      }
      advancedController.set(command.open)
      expected.advancedOpen = command.open
      break
  }
  while (Date.now() < request.expiresAt && entries.size === 1 && entries.has(controller)) {
    const state = controller.read()
    const matches = Object.entries(expected).every(
      ([key, value]) => Reflect.get(state, key) === value
    )
    const draftApplied =
      command.operation !== 'ssh.form-draft' || controller.matchesDraft(command.updates)
    const configApplied =
      (!loaded || controller.config?.matchesList(loaded, loadedQuery)) &&
      (!selected || controller.matchesDraft(selected))
    if (!ownerSucceeded) {
      return {
        viewerId: command.viewerId,
        persisted,
        applied: false,
        state,
        reason: 'ssh_action_failed'
      }
    }
    const connectionApplied =
      command.operation === 'ssh.connect' || command.operation === 'ssh.disconnect'
        ? controller.actions?.matchesConnection(
            command.operation === 'ssh.connect' ? 'connect' : 'disconnect',
            command.targetId
          ) === true
        : true
    const importApplied =
      !importedTargets || controller.actions?.matchesImported(importedTargets) === true
    if (matches && draftApplied && configApplied && connectionApplied && importApplied) {
      return { viewerId: command.viewerId, persisted, applied: true, state }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 16))
  }
  if (entries.size !== 1 || !entries.has(controller)) {
    throw new Error('connections_surface_unavailable')
  }
  return {
    viewerId: command.viewerId,
    persisted,
    applied: false,
    state: controller.read(),
    reason: 'viewer_not_applied'
  }
}
