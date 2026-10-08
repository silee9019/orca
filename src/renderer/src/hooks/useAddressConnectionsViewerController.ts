import { useEffect, useRef } from 'react'
import {
  mountAddressPickerViewerController,
  mountAddressDialogViewerController,
  type AddressDialogViewerController,
  type AddressPickerViewerController
} from '@/runtime/address-connections-viewer-controller'
export function useAddressPickerViewerController(controller: AddressPickerViewerController): void {
  const committed = useRef(controller)
  useEffect(() => {
    committed.current = controller
  })
  useEffect(
    () =>
      mountAddressPickerViewerController({
        id: controller.id,
        read: () => committed.current.read(),
        available: () => committed.current.available(),
        picker: (open) => committed.current.picker(open),
        custom: (open) => committed.current.custom(open),
        highlight: (value) => committed.current.highlight(value),
        select: (value) => committed.current.select(value),
        remove: (value) => committed.current.remove(value),
        matches: (kind, value) => committed.current.matches(kind, value)
      }),
    [controller.id]
  )
}
export function useAddressDialogViewerController(controller: AddressDialogViewerController): void {
  const committed = useRef(controller)
  useEffect(() => {
    committed.current = controller
  })
  useEffect(
    () =>
      mountAddressDialogViewerController({
        id: controller.id,
        read: () => committed.current.read(),
        draft: (value) => committed.current.draft(value),
        matchesDraft: (value) => committed.current.matchesDraft(value),
        confirmedValue: () => committed.current.confirmedValue(),
        close: () => committed.current.close(),
        submit: () => committed.current.submit()
      }),
    [controller.id]
  )
}
