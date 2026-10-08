import type { ArtifactPublishedLinkControl } from '@/components/artifacts/ArtifactPublishedLinkPanel'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import {
  ArtifactPublishViewerRequestSchema,
  type ArtifactPublishViewerRequest
} from '../../../shared/artifact-publish-viewer-command'

type Form = {
  sourceKey: string
  linkRef: RefObject<ArtifactPublishedLinkControl | null>
  lookupKey: string | null
  open: boolean
  disabled: boolean
  authState: string
  configured: boolean
  contentRef: RefObject<HTMLDivElement | null>
  anchorRef?: RefObject<HTMLButtonElement | null>
  connect: () => Promise<boolean>
  signedIn: boolean
  sharingEnabled: boolean
  publishing: boolean
  lookupStatus: 'idle' | 'loading' | 'loaded' | 'error'
  lookupSequence: number
  publishedLink: string | null
  setOpen: (value: boolean) => void
  openSettings: () => void
  retry: () => void
  publish: () => Promise<boolean>
}
function snapshot(form: Form, targetToken: string, busy = form.publishing) {
  return {
    sourceKey: form.sourceKey,
    targetToken,
    open: form.open,
    disabled: form.disabled,
    busy,
    authState: form.authState,
    configured: form.configured,
    signedIn: form.signedIn,
    sharingEnabled: form.sharingEnabled,
    publishing: form.publishing,
    lookupStatus: form.lookupStatus,
    publishedLink: form.publishedLink,
    copied: form.linkRef.current?.copied ?? false
  }
}
export type ArtifactPublishViewerState = {
  viewer: 'desktop'
  committed: true
  publish: ReturnType<typeof snapshot>
}
type Control = (
  action: ArtifactPublishViewerRequest['action']
) => Promise<ArtifactPublishViewerState>
type Request = {
  token: string
  allowTargetChange: boolean
  ready: boolean
  expectedOpen?: boolean
  lookupAfter?: number
  resolve: (state: ArtifactPublishViewerState) => void
  reject: (error: Error) => void
}
const mountedForms = new Map<Control, () => string>()
export async function applyArtifactPublishViewerAction(
  request: ArtifactPublishViewerRequest
): Promise<ArtifactPublishViewerState> {
  const parsed = ArtifactPublishViewerRequestSchema.parse(request)
  const matches = [...mountedForms].filter(([, sourceKey]) => sourceKey() === parsed.sourceKey)
  if (matches.length !== 1) {
    throw new Error(matches.length ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = matches[0]?.[0]
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control(parsed.action)
}
export function useArtifactPublishViewerController(form: Form): void {
  const latest = useRef(form)
  const target = useRef({
    key: form.lookupKey,
    sourceKey: form.sourceKey,
    token: createBrowserUuid()
  })
  const pending = useRef<Request | null>(null)
  const [, setRevision] = useState(0)
  useLayoutEffect(() => {
    latest.current = form
    if (target.current.key !== form.lookupKey || target.current.sourceKey !== form.sourceKey) {
      target.current = {
        key: form.lookupKey,
        sourceKey: form.sourceKey,
        token: createBrowserUuid()
      }
    }
  })
  useEffect(() => {
    const request = pending.current
    if (!request) {
      return
    }
    if (!request.allowTargetChange && request.token !== target.current.token) {
      pending.current = null
      request.reject(new Error('viewer_target_changed'))
      return
    }
    if (!request.ready) {
      return
    }
    if (request.expectedOpen !== undefined && form.open !== request.expectedOpen) {
      pending.current = null
      request.reject(new Error('artifact_popover_changed'))
      return
    }
    if (
      request.lookupAfter !== undefined &&
      form.signedIn &&
      form.open &&
      (form.lookupSequence <= request.lookupAfter ||
        form.lookupStatus === 'loading' ||
        form.lookupStatus === 'idle')
    ) {
      return
    }
    pending.current = null
    request.resolve({
      viewer: 'desktop',
      committed: true,
      publish: snapshot(form, target.current.token)
    })
  })
  useEffect(() => {
    const control: Control = async (action) => {
      const current = latest.current
      if (action.kind === 'get') {
        return {
          viewer: 'desktop',
          committed: true,
          publish: snapshot(
            current,
            target.current.token,
            Boolean(pending.current) || current.publishing
          )
        }
      }
      if (pending.current || current.publishing) {
        throw new Error('viewer_busy')
      }
      if (
        current.disabled &&
        (action.kind === 'publish' ||
          action.kind === 'update-link' ||
          (action.kind === 'open' && action.value))
      ) {
        throw new Error('artifact_publish_disabled')
      }
      if (action.kind !== 'open' && action.kind !== 'focus-anchor' && !current.open) {
        throw new Error('artifact_publish_closed')
      }
      if (action.kind === 'connect' && (current.signedIn || !current.configured)) {
        throw new Error('artifact_connect_unavailable')
      }
      if (action.kind === 'focus-content' || action.kind === 'focus-anchor') {
        if (action.kind === 'focus-anchor' && current.open) {
          throw new Error('artifact_popover_open')
        }
        const node =
          action.kind === 'focus-content' ? current.contentRef.current : current.anchorRef?.current
        if (!node) {
          throw new Error('viewer_unavailable')
        }
        node.focus({ preventScroll: true })
        if (node.ownerDocument.activeElement !== node) {
          throw new Error('artifact_focus_failed')
        }
        return {
          viewer: 'desktop',
          committed: true,
          publish: snapshot(current, target.current.token)
        }
      }
      const linkAction =
        action.kind === 'copy-link' || action.kind === 'open-link' || action.kind === 'update-link'
      if (
        linkAction &&
        (action.reviewedTarget !== target.current.token ||
          action.reviewedLink !== current.publishedLink)
      ) {
        throw new Error('viewer_target_changed')
      }
      if (
        linkAction &&
        (!current.publishedLink || current.linkRef.current?.shareUrl !== current.publishedLink)
      ) {
        throw new Error('artifact_link_unavailable')
      }
      if (action.kind === 'publish' || action.kind === 'update-link') {
        if (!current.signedIn) {
          throw new Error('artifact_account_unavailable')
        }
        if (!current.sharingEnabled) {
          throw new Error('artifact_sharing_disabled')
        }
        if (action.reviewedTarget !== target.current.token) {
          throw new Error('viewer_target_changed')
        }
        if (current.lookupStatus !== 'loaded') {
          throw new Error('artifact_link_unavailable')
        }
      }
      if (action.kind === 'open-settings' && current.sharingEnabled) {
        throw new Error('artifact_settings_unavailable')
      }
      if (action.kind === 'retry' && (!current.signedIn || current.lookupStatus !== 'error')) {
        throw new Error('artifact_retry_unavailable')
      }
      return new Promise((resolve, reject) => {
        const request: Request = {
          token: target.current.token,
          allowTargetChange: action.kind === 'connect',
          ready: false,
          resolve,
          reject,
          expectedOpen:
            action.kind === 'open'
              ? action.value
              : action.kind === 'open-settings'
                ? false
                : undefined,
          lookupAfter:
            action.kind === 'retry' || (action.kind === 'open' && action.value && !current.open)
              ? current.lookupSequence
              : undefined
        }
        pending.current = request
        void (async () => {
          switch (action.kind) {
            case 'connect':
              if (!(await current.connect())) {
                throw new Error('artifact_account_connection_not_completed')
              }
              break
            case 'open-settings':
              current.openSettings()
              break
            case 'open':
              current.setOpen(action.value)
              break
            case 'retry':
              current.retry()
              break
            case 'copy-link':
            case 'open-link':
              if (
                !(await (action.kind === 'copy-link'
                  ? current.linkRef.current?.copy()
                  : current.linkRef.current?.open()))
              ) {
                throw new Error('artifact_link_action_failed')
              }
              break
            case 'update-link':
            case 'publish':
              if (!(await current.publish())) {
                throw new Error('artifact_publish_failed')
              }
              break
          }
        })().then(
          () => {
            if (pending.current !== request) {
              return
            }
            request.ready = true
            setRevision((value) => value + 1)
          },
          (error: unknown) => {
            if (pending.current !== request) {
              return
            }
            pending.current = null
            reject(error instanceof Error ? error : new Error('artifact_publish_failed'))
          }
        )
      })
    }
    mountedForms.set(control, () => latest.current.sourceKey)
    return () => {
      mountedForms.delete(control)
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    }
  }, [])
}
