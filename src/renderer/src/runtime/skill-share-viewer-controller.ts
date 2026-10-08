import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  SkillShareViewerActionSchema,
  type SkillShareViewerAction
} from '../../../shared/skill-share-viewer-command'
import type { SkillSharePreview, SkillShareProgress } from '../../../shared/skill-sharing-contract'

type Form = {
  open: boolean
  skillIds: readonly string[]
  preview: SkillSharePreview | null
  hasCloudAccount: boolean
  releaseNotes: string
  setReleaseNotes: (value: string) => void
  preparing: boolean
  publishing: boolean
  cancelling: boolean
  progress: SkillShareProgress | null
  shareUrl: string | null
  error: string | null
  publish: () => Promise<void>
  cancelPublish: () => Promise<void>
  copyLink: () => Promise<void>
  close: () => Promise<void>
  manageLinks: () => Promise<void>
}
function snapshot(form: Form, closed = !form.open) {
  return {
    viewer: 'desktop' as const,
    committed: true as const,
    closed,
    skillIds: form.skillIds,
    preview: form.preview,
    hasCloudAccount: form.hasCloudAccount,
    releaseNotes: form.releaseNotes,
    preparing: form.preparing,
    publishing: form.publishing,
    cancelling: form.cancelling,
    progress: form.progress,
    shareUrl: form.shareUrl,
    error: form.error
  }
}
export type SkillShareViewerState = ReturnType<typeof snapshot>
type Control = (action: SkillShareViewerAction) => Promise<SkillShareViewerState>
const mountedForms = new Set<Control>()
export async function applySkillShareViewerAction(
  action: SkillShareViewerAction
): Promise<SkillShareViewerState> {
  const parsed = SkillShareViewerActionSchema.parse(action)
  if (mountedForms.size !== 1) {
    throw new Error(mountedForms.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mountedForms.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control(parsed)
}
export function useSkillShareViewerController(form: Form): void {
  const latest = useRef(form)
  const mounted = useRef(false)
  useLayoutEffect(() => {
    latest.current = form
  })
  const [, setRevision] = useState(0)
  type Request = {
    preparationId: string | undefined
    skillIds: string
    ready: boolean
    close: boolean
    resolve: (state: SkillShareViewerState) => void
    reject: (error: Error) => void
  }
  const pending = useRef<Request | null>(null)
  const cancellation = useRef<Request | null>(null)
  useEffect(() => {
    for (const slot of [pending, cancellation]) {
      const request = slot.current
      if (!request) {
        continue
      }
      if (request.close && !form.open) {
        if (request.ready) {
          slot.current = null
          request.resolve(snapshot(form, true))
        }
      } else if (
        !form.open ||
        request.preparationId !== form.preview?.preparationId ||
        request.skillIds !== JSON.stringify(form.skillIds)
      ) {
        slot.current = null
        request.reject(new Error('viewer_target_changed'))
      } else if (request.ready) {
        slot.current = null
        request.resolve(snapshot(form))
      }
    }
  })
  useEffect(() => {
    if (!form.open) {
      return
    }
    mounted.current = true
    const control: Control = async (action) => {
      const current = latest.current
      if (action.kind === 'get') {
        return snapshot(current)
      }
      const cancelling = action.kind === 'cancel'
      if (cancelling) {
        if (cancellation.current || current.cancelling) {
          throw new Error('viewer_busy')
        }
        if (!current.publishing || !current.preview) {
          throw new Error('skill_share_upload_not_active')
        }
      } else if (pending.current || cancellation.current || current.publishing) {
        throw new Error('viewer_busy')
      }
      if (
        (action.kind === 'publish' || action.kind === 'release-notes') &&
        (!current.preview || current.preparing || current.shareUrl)
      ) {
        throw new Error('skill_share_preparation_unavailable')
      }
      if ((action.kind === 'copy-link' || action.kind === 'manage-links') && !current.shareUrl) {
        throw new Error('skill_share_link_unavailable')
      }
      return new Promise((resolve, reject) => {
        const slot = cancelling ? cancellation : pending
        const request: Request = {
          preparationId: current.preview?.preparationId,
          skillIds: JSON.stringify(current.skillIds),
          ready: false,
          close: action.kind === 'close' || action.kind === 'manage-links',
          resolve,
          reject
        }
        slot.current = request
        let operation: Promise<void> | undefined
        switch (action.kind) {
          case 'release-notes':
            current.setReleaseNotes(action.value)
            break
          case 'publish':
            operation = current.publish()
            break
          case 'cancel':
            operation = current.cancelPublish()
            break
          case 'copy-link':
            operation = current.copyLink()
            break
          case 'manage-links':
            operation = current.manageLinks()
            break
          case 'close':
            operation = current.close()
            break
        }
        void Promise.resolve(operation).then(
          () => {
            if (slot.current !== request) {
              return
            }
            request.ready = true
            if (request.close && (!mounted.current || !latest.current.open)) {
              slot.current = null
              resolve(snapshot(latest.current, true))
            } else {
              setRevision((value) => value + 1)
            }
          },
          (error: unknown) => {
            if (slot.current !== request) {
              return
            }
            slot.current = null
            reject(error instanceof Error ? error : new Error('skill_share_action_failed'))
          }
        )
      })
    }
    mountedForms.add(control)
    return () => {
      mounted.current = false
      mountedForms.delete(control)
      for (const slot of [pending, cancellation]) {
        const request = slot.current
        if (!request?.close) {
          request?.reject(new Error('viewer_unmounted'))
          slot.current = null
        }
      }
    }
  }, [form.open])
}
