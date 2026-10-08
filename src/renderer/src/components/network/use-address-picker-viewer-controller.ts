import { useAddressPickerViewerController } from '@/hooks/useAddressConnectionsViewerController'
import type { AddressOption } from './AddressPicker'
export function useAddressPickerConnectionsController(input: {
  id: string
  disabled: boolean
  pickerOpen: boolean
  dialogOpen: boolean
  commandValue: string
  value: string | undefined
  options: readonly AddressOption[]
  customOptions: readonly AddressOption[]
  picker: (open: boolean) => void
  custom: (open: boolean) => void
  highlight: (value: string) => void
  select: (value: string, custom: boolean) => void
  remove?: (value: string) => void
}): void {
  const find = (value: string): boolean | null =>
    input.options.some((entry) => entry.value === value)
      ? false
      : input.customOptions.some((entry) => entry.value === value)
        ? true
        : null
  useAddressPickerViewerController({
    id: input.id,
    available: () => !input.disabled,
    read: () => ({
      pickerOpen: input.pickerOpen,
      dialogOpen: input.dialogOpen,
      highlightSet: Boolean(input.commandValue),
      selectionSet: Boolean(input.value),
      customCount: input.customOptions.length
    }),
    picker: input.picker,
    custom: (open) => {
      if (open) {
        input.picker(false)
      }
      input.custom(open)
    },
    highlight: (value) => {
      const valid =
        value === 'add-custom-address' ||
        input.options.some((entry) => `detected:${entry.value}` === value) ||
        input.customOptions.some((entry) => `custom:${entry.value}` === value)
      if (valid) {
        input.highlight(value)
      }
      return valid
    },
    select: (value) => {
      const custom = find(value)
      if (custom === null) {
        return false
      }
      input.select(value, custom)
      return true
    },
    remove: (value) => {
      if (!input.remove || !input.customOptions.some((entry) => entry.value === value)) {
        return false
      }
      input.remove(value)
      return true
    },
    matches: (kind, value) =>
      kind === 'highlight'
        ? input.commandValue === value
        : kind === 'select'
          ? input.value === value
          : !input.customOptions.some((entry) => entry.value === value)
  })
}
