import type {
  ConnectionsViewerRequest,
  AddressConnectionsViewerResult,
  AddressConnectionsViewerState
} from '../../../shared/connections-viewer'
import { AddressConnectionsViewerParams } from '../../../shared/rpc-contract/connections-viewer-params'
export type AddressPickerViewerController = {
  id: string
  read: () => Pick<
    AddressConnectionsViewerState,
    'pickerOpen' | 'dialogOpen' | 'highlightSet' | 'selectionSet' | 'customCount'
  >
  available: () => boolean
  picker: (open: boolean) => void
  custom: (open: boolean) => void
  highlight: (value: string) => boolean
  select: (value: string) => boolean
  remove: (value: string) => boolean
  matches: (kind: 'highlight' | 'select' | 'remove', value: string) => boolean
}
export type AddressDialogViewerController = {
  id: string
  read: () => Pick<
    AddressConnectionsViewerState,
    'draftSet' | 'valid' | 'submitting' | 'confirmationFailed'
  >
  draft: (value: string) => void
  matchesDraft: (value: string) => boolean
  confirmedValue: () => string | null
  close: () => void
  submit: () => Promise<void>
}
const pickers = new Set<AddressPickerViewerController>()
const dialogs = new Set<AddressDialogViewerController>()
export function mountAddressPickerViewerController(
  controller: AddressPickerViewerController
): () => void {
  pickers.add(controller)
  return () => {
    pickers.delete(controller)
  }
}
export function mountAddressDialogViewerController(
  controller: AddressDialogViewerController
): () => void {
  dialogs.add(controller)
  return () => {
    dialogs.delete(controller)
  }
}
export async function applyAddressConnectionsViewerRequest(
  request: ConnectionsViewerRequest
): Promise<AddressConnectionsViewerResult> {
  const parsed = AddressConnectionsViewerParams.safeParse(request.command)
  if (!parsed.success) {
    throw new Error('invalid_connections_viewer_command')
  }
  if (Date.now() >= request.expiresAt) {
    throw new Error('request_expired')
  }
  const command = parsed.data
  const targets = [...pickers].filter((value) => value.id === command.pickerId)
  const targetDialogs = [...dialogs].filter((value) => value.id === command.pickerId)
  const picker = targets[0]
  const dialog = targetDialogs[0]
  if (targets.length > 1 || targetDialogs.length > 1) {
    throw new Error('connections_viewer_ambiguous')
  }
  if (!picker || !dialog) {
    throw new Error('connections_surface_unavailable')
  }
  if (!picker.available() && command.operation !== 'address.get') {
    throw new Error('address_picker_disabled')
  }
  const read = (): AddressConnectionsViewerState => ({ ...picker.read(), ...dialog.read() })
  const expected: Partial<AddressConnectionsViewerState> = {}
  let matches = (): boolean => true
  switch (command.operation) {
    case 'address.get':
      break
    case 'address.picker-open':
      picker.picker(command.open)
      expected.pickerOpen = command.open
      break
    case 'address.custom-open':
      if (!command.open && dialog.read().submitting) {
        throw new Error('address_submit_in_progress')
      }
      picker.custom(command.open)
      expected.dialogOpen = command.open
      break
    case 'address.highlight':
      if (!picker.read().pickerOpen || !picker.highlight(command.value)) {
        throw new Error('address_option_unavailable')
      }
      matches = () => picker.matches('highlight', command.value)
      break
    case 'address.select':
      if (!picker.select(command.value)) {
        throw new Error('address_option_unavailable')
      }
      matches = () => picker.matches('select', command.value)
      expected.pickerOpen = false
      break
    case 'address.remove':
      if (!picker.remove(command.value)) {
        throw new Error('address_option_unavailable')
      }
      matches = () => picker.matches('remove', command.value)
      break
    case 'address.custom-draft':
      if (!picker.read().dialogOpen || dialog.read().submitting) {
        throw new Error('address_dialog_unavailable')
      }
      dialog.draft(command.value)
      matches = () => dialog.matchesDraft(command.value)
      break
    case 'address.custom-cancel':
      if (dialog.read().submitting) {
        throw new Error('address_submit_in_progress')
      }
      dialog.close()
      expected.dialogOpen = false
      break
    case 'address.custom-submit':
      if (!picker.read().dialogOpen || !dialog.read().valid || dialog.read().submitting) {
        throw new Error('address_dialog_invalid')
      }
      const confirmed = dialog.confirmedValue()
      if (confirmed === null) {
        throw new Error('address_dialog_invalid')
      }
      await dialog.submit()
      matches = () => picker.matches('select', confirmed)
      expected.dialogOpen = false
      break
  }
  while (Date.now() < request.expiresAt && pickers.has(picker) && dialogs.has(dialog)) {
    const state = read()
    if (
      Object.entries(expected).every(([key, value]) => Reflect.get(state, key) === value) &&
      matches()
    ) {
      return { viewerId: command.viewerId, persisted: null, applied: true, state }
    }
    if (command.operation === 'address.custom-submit' && state.confirmationFailed) {
      return {
        viewerId: command.viewerId,
        persisted: false,
        applied: false,
        state,
        reason: 'address_confirmation_failed'
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 16))
  }
  return {
    viewerId: command.viewerId,
    persisted: null,
    applied: false,
    state: read(),
    reason: 'viewer_not_applied'
  }
}
