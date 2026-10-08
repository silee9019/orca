import type { RefObject } from 'react'
import { useAppSurfaceControl } from '../../hooks/ipc-events/app-surface-ipc-bridge'

export function useFeedbackDraftCliControl(args: {
  open: boolean
  busy: boolean
  images: readonly { id: string }[]
  remove: (id: string) => void
  textarea: RefObject<HTMLTextAreaElement | null>
}): void {
  useAppSurfaceControl('feedback-draft', (input) => {
    if (input.kind !== 'feedback-draft') {
      return
    }
    if (!args.open) {
      throw new Error('Open the feedback dialog in this viewer first')
    }
    if (input.action === 'status') {
      return { busy: args.busy, images: args.images.map(({ id }) => ({ id })) }
    }
    if (args.busy) {
      throw new Error('Wait for the feedback submission to finish')
    }
    if (input.action === 'focus') {
      if (!args.textarea.current) {
        throw new Error('Feedback editor is unavailable')
      }
      args.textarea.current.focus()
    } else {
      const image = args.images.find((image) => image.id === input.imageId)
      if (!image) {
        throw new Error('Specify an imageId from feedback-draft status')
      }
      args.remove(image.id)
    }
    return { state: 'requested' }
  })
}
