import { applyArtifactDeleteConfirmation } from './artifact-delete-viewer-controller'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type { ArtifactListItem } from '../../../shared/artifacts'
import {
  copyArtifactLink,
  openArtifactInBrowser
} from '@/components/artifacts/artifact-link-actions'
import {
  applyArtifactPublishViewerAction,
  type ArtifactPublishViewerState
} from './artifact-publish-viewer-controller'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ArtifactViewerAction } from '../../../shared/artifact-viewer-command'
import { ArtifactViewerActionSchema } from '../../../shared/artifact-viewer-command'

type ViewerState = {
  viewer: 'desktop'
  committed: true
  targetToken: string
  busy: boolean
  query: string
  selectedSlug: string | null
  loadedSlugs: readonly string[]
  visibleSlugs: readonly string[]
  hasMore: boolean
  loading: boolean
  error: string | null
}
type PageAction = Exclude<ArtifactViewerAction, { kind: 'publish-form' | 'delete-confirmation' }>
type Controller = (action: PageAction) => Promise<ViewerState>
const mountedViewers = new Set<Controller>()

export async function applyArtifactViewerAction(
  action: ArtifactViewerAction
): Promise<
  | ViewerState
  | ArtifactPublishViewerState
  | Awaited<ReturnType<typeof applyArtifactDeleteConfirmation>>
> {
  const parsed = ArtifactViewerActionSchema.parse(action)
  if (parsed.kind === 'delete-confirmation') {
    return applyArtifactDeleteConfirmation(parsed)
  }
  if (parsed.kind === 'publish-form') {
    return applyArtifactPublishViewerAction({ sourceKey: parsed.sourceKey, action: parsed.action })
  }
  if (mountedViewers.size !== 1) {
    throw new Error(mountedViewers.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const controller = mountedViewers.values().next().value
  if (!controller) {
    throw new Error('viewer_unavailable')
  }
  return controller(parsed)
}

export function useArtifactViewerController(options: {
  identity: string | null
  slugs: readonly string[]
  visibleSlugs: (query: string) => readonly string[]
  refresh: () => Promise<void>
  loadMore: () => Promise<void>
  hasMore: boolean
  loading: boolean
  error: string | null
  items?: readonly ArtifactListItem[]
  deleteArtifact?: (item: ArtifactListItem, reviewedTarget: string) => Promise<boolean>
  connect?: () => Promise<boolean>
  openAccountSettings?: () => void
  openArtifactsSettings?: () => void
}) {
  const target = useRef({ identity: options.identity, token: createBrowserUuid() })
  const [query, setQuery] = useState('')
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const latest = useRef({ options, query, selectedSlug })
  useLayoutEffect(() => {
    latest.current = { options, query, selectedSlug }
    if (target.current.identity !== options.identity) {
      target.current = { identity: options.identity, token: createBrowserUuid() }
    }
  })
  const pending = useRef<{
    identity: string | null
    kind: PageAction['kind']
    ready: boolean
    resolve: (state: ViewerState) => void
    reject: (error: Error) => void
  } | null>(null)
  function snapshot(): ViewerState {
    const state = latest.current
    return {
      viewer: 'desktop',
      committed: true,
      targetToken: target.current.token,
      busy: Boolean(pending.current),
      query: state.query,
      selectedSlug: state.selectedSlug,
      loadedSlugs: state.options.slugs,
      visibleSlugs: state.options.visibleSlugs(state.query),
      hasMore: state.options.hasMore,
      loading: state.options.loading,
      error: state.options.error
    }
  }
  useEffect(() => {
    const request = pending.current
    if (!request) {
      return
    }
    if (request.kind !== 'connect' && request.identity !== options.identity) {
      pending.current = null
      request.reject(new Error('viewer_target_changed'))
    } else if (request.ready) {
      pending.current = null
      if (
        (request.kind === 'refresh' || request.kind === 'load-more') &&
        latest.current.options.error
      ) {
        request.reject(new Error('artifact_refresh_failed'))
      } else {
        request.resolve(snapshot())
      }
    }
  }, [revision, query, selectedSlug, options.identity])
  useEffect(() => {
    const control: Controller = async (action) => {
      const current = latest.current.options
      if (action.kind === 'get') {
        return snapshot()
      }
      if (
        (action.kind === 'connect' && !current.connect) ||
        (action.kind === 'open-account-settings' && !current.openAccountSettings) ||
        (action.kind === 'open-artifacts-settings' && !current.openArtifactsSettings)
      ) {
        throw new Error(
          action.kind === 'connect'
            ? 'artifact_connect_unavailable'
            : 'artifact_settings_unavailable'
        )
      }
      if (action.kind === 'copy-link' || action.kind === 'open-link' || action.kind === 'delete') {
        if (latest.current.selectedSlug !== action.slug) {
          throw new Error('artifact_detail_closed')
        }
        const item = current.items?.find((item) => item.artifact.slug === action.slug)
        if (
          !item ||
          action.reviewedTarget !== target.current.token ||
          item.shareUrl !== action.reviewedLink
        ) {
          throw new Error('viewer_target_changed')
        }
      }
      if ((action.kind === 'refresh' || action.kind === 'load-more') && !current.identity) {
        throw new Error('artifact_account_unavailable')
      }
      if (pending.current) {
        throw new Error('viewer_busy')
      }
      if (
        action.kind === 'select' &&
        action.slug !== null &&
        !current.slugs.includes(action.slug)
      ) {
        throw new Error('artifact_not_loaded')
      }
      if (action.kind === 'load-more' && !current.hasMore) {
        throw new Error('artifact_no_next_page')
      }
      if ((action.kind === 'refresh' || action.kind === 'load-more') && current.loading) {
        throw new Error('viewer_busy')
      }
      return new Promise((resolve, reject) => {
        const request = {
          identity: current.identity,
          kind: action.kind,
          ready: true,
          resolve,
          reject
        }
        pending.current = request
        switch (action.kind) {
          case 'query':
            setQuery(action.value)
            break
          case 'select':
            setSelectedSlug(action.slug)
            break
          case 'open-account-settings':
            current.openAccountSettings?.()
            break
          case 'open-artifacts-settings':
            current.openArtifactsSettings?.()
            break
          case 'delete':
          case 'copy-link':
          case 'open-link':
          case 'connect':
          case 'refresh':
          case 'load-more': {
            request.ready = false
            const operation = async () => {
              switch (action.kind) {
                case 'refresh':
                  return current.refresh()
                case 'load-more':
                  return current.loadMore()
                case 'connect':
                  if (!(await current.connect?.())) {
                    throw new Error('artifact_account_connection_not_completed')
                  }
                  return
                case 'delete': {
                  const item = current.items?.find((item) => item.artifact.slug === action.slug)
                  if (!item || !(await current.deleteArtifact?.(item, action.reviewedTarget))) {
                    throw new Error('artifact_delete_not_completed')
                  }
                  return
                }
                case 'copy-link':
                case 'open-link':
                  if (
                    !(await (action.kind === 'copy-link'
                      ? copyArtifactLink(action.reviewedLink)
                      : openArtifactInBrowser(action.reviewedLink)))
                  ) {
                    throw new Error('artifact_link_action_failed')
                  }
              }
            }
            void operation().then(
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
                reject(error instanceof Error ? error : new Error('artifact_refresh_failed'))
              }
            )
            return
          }
        }
        setRevision((value) => value + 1)
      })
    }
    mountedViewers.add(control)
    return () => {
      mountedViewers.delete(control)
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    }
  }, [])
  return { query, setQuery, selectedSlug, setSelectedSlug }
}
