import { bindArtifactDeleteConfirmation } from '@/runtime/artifact-delete-viewer-controller'
import { useMountedRef } from '@/hooks/useMountedRef'
import { useArtifactViewerController } from '../../runtime/artifact-viewer-controller'
import { filterArtifactsBySearchQuery } from './artifact-list-search'
import { useEffect, useRef, useState } from 'react'
import type { ArtifactCloudOperation, ArtifactListItem } from '../../../../shared/artifacts'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { persistConfirmationSkipPreference } from '@/components/confirmation-skip-preference'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { ArtifactCollection } from './ArtifactCollection'
import { ArtifactDetailDrawer } from './ArtifactDetailDrawer'
import { ArtifactsPageSkeleton } from './ArtifactsPageSkeleton'
import {
  ArtifactsPageAuthState,
  ArtifactsPageEmptyState,
  ArtifactsPageErrorBanner
} from './ArtifactsPageStates'
import { artifactAccountIdentity, useArtifactPagination } from './useArtifactPagination'

const LOCAL_RUNTIME = { kind: 'local' } as const

export default function ArtifactsPage(): React.JSX.Element {
  const closePage = useAppStore((state) => state.closeArtifactsPage)
  const authStatus = useAppStore((state) => state.orcaProfileAuthStatus)
  const connect = useAppStore((state) => state.connectCurrentOrcaProfile)
  const refreshAuth = useAppStore((state) => state.refreshCurrentOrcaProfileAuth)
  const openSettingsPage = useAppStore((state) => state.openSettingsPage)
  const openSettingsTarget = useAppStore((state) => state.openSettingsTarget)
  const settings = useAppStore((state) => state.settings)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const confirm = useConfirmationDialog()
  const mountedRef = useMountedRef()
  const deleteAbort = useRef<AbortController | null>(null)
  // Why: publishing is off by default, so "ask your agent to share" is a dead end until the
  // capability is granted. Only claim that once settings have actually loaded.
  const publishingBlocked = settings ? settings.artifactSharingEnabled !== true : false
  const [deleting, setDeleting] = useState<{ identity: string; slug: string } | null>(null)
  const signedIn = authStatus?.state === 'connected'
  const needsReconnect = authStatus?.state === 'reconnect-required'
  const openAccountSettings = (): void => {
    openSettingsTarget({ pane: 'orca-account', repoId: null })
    openSettingsPage()
  }
  const {
    accountIdentity,
    artifacts,
    error,
    loading,
    loadingMore,
    nextCursor,
    loadArtifacts,
    loadMoreArtifacts,
    removeArtifact,
    setError
  } = useArtifactPagination(authStatus, refreshAuth)
  useEffect(
    () => () => {
      deleteAbort.current?.abort()
    },
    [accountIdentity]
  )
  const { query, setQuery, selectedSlug, setSelectedSlug } = useArtifactViewerController({
    identity: accountIdentity,
    slugs: artifacts.map((item) => item.artifact.slug),
    visibleSlugs: (value) =>
      filterArtifactsBySearchQuery(artifacts, value).map((item) => item.artifact.slug),
    refresh: loadArtifacts,
    loadMore: loadMoreArtifacts,
    hasMore: Boolean(nextCursor),
    loading: loading || loadingMore,
    error,
    items: artifacts,
    deleteArtifact: (item, reviewedTarget) => deleteArtifact(item, reviewedTarget),
    connect:
      !signedIn && authStatus?.configured === true
        ? async () => (await connect())?.status === 'connected'
        : undefined,
    openAccountSettings:
      !signedIn && authStatus?.configured !== true ? openAccountSettings : undefined,
    openArtifactsSettings:
      signedIn && artifacts.length === 0 && !nextCursor && publishingBlocked
        ? () => {
            openSettingsTarget({ pane: 'artifacts', repoId: null })
            openSettingsPage()
          }
        : undefined
  })
  const deletingId = deleting?.identity === accountIdentity ? deleting.slug : null
  const selectedArtifact =
    selectedSlug === null
      ? null
      : (artifacts.find(({ artifact }) => artifact.slug === selectedSlug) ?? null)

  useEffect(() => {
    if (selectedSlug && !artifacts.some(({ artifact }) => artifact.slug === selectedSlug)) {
      setSelectedSlug(null)
    }
  }, [selectedSlug, artifacts, setSelectedSlug])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return
      }
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        return
      }
      if (target.dataset.escapeClearsValue === 'true') {
        return
      }
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable
      ) {
        event.preventDefault()
        target.blur()
        return
      }
      if (selectedSlug) {
        event.preventDefault()
        setSelectedSlug(null)
        return
      }
      event.preventDefault()
      closePage()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closePage, selectedSlug, setSelectedSlug])

  const deleteArtifact = async (
    item: ArtifactListItem,
    reviewedTarget?: string
  ): Promise<boolean> => {
    if (deleteAbort.current || !mountedRef.current) {
      return false
    }
    const controller = new AbortController()
    deleteAbort.current = controller
    try {
      const name = item.artifact.title || item.artifact.originalFileName || item.artifact.slug
      if (!settings?.skipDeleteArtifactConfirm) {
        const accepted = await confirm({
          signal: controller.signal,
          onViewerControl: reviewedTarget
            ? bindArtifactDeleteConfirmation({ slug: item.artifact.slug, reviewedTarget })
            : undefined,
          title: translate(
            'auto.components.artifacts.ArtifactsPage.deleteTitle',
            'Delete artifact?'
          ),
          description: translate(
            'auto.components.artifacts.ArtifactsPage.deleteDescription',
            '“{{name}}” will no longer be available at its public link.',
            { name }
          ),
          confirmLabel: translate('auto.components.artifacts.ArtifactsPage.delete', 'Delete'),
          confirmVariant: 'destructive',
          dontAskAgain: {
            onConfirmed: () =>
              persistConfirmationSkipPreference({
                updates: { skipDeleteArtifactConfirm: true },
                settingsSectionId: 'general-skip-delete-artifact-confirm',
                updateSettings,
                openSettingsPage,
                openSettingsTarget
              })
          }
        })
        if (!accepted) {
          return false
        }
      }
      if (controller.signal.aborted || !mountedRef.current) {
        return false
      }
      const requestedIdentity = accountIdentity
      if (!requestedIdentity) {
        return false
      }
      const requestedAccountIsCurrent = (): boolean =>
        artifactAccountIdentity(useAppStore.getState().orcaProfileAuthStatus) === requestedIdentity
      if (!requestedAccountIsCurrent()) {
        return false
      }
      setDeleting({ identity: requestedIdentity, slug: item.artifact.slug })
      try {
        const result = await callRuntimeRpc<ArtifactCloudOperation<void>>(
          LOCAL_RUNTIME,
          'artifacts.delete',
          { id: item.artifact.slug }
        )
        if (!requestedAccountIsCurrent()) {
          return false
        }
        if (result.status !== 'ok') {
          await refreshAuth()
          throw new Error(result.status)
        }
        removeArtifact(requestedIdentity, item.artifact.slug)
        return true
      } catch {
        console.error('Failed to delete artifact')
        if (requestedAccountIsCurrent()) {
          setError(
            translate(
              'auto.components.artifacts.ArtifactsPage.deleteFailed',
              'Could not delete the artifact.'
            )
          )
        }
        return false
      } finally {
        setDeleting((current) =>
          current?.identity === requestedIdentity && current.slug === item.artifact.slug
            ? null
            : current
        )
      }
    } finally {
      if (deleteAbort.current === controller) {
        deleteAbort.current = null
      }
    }
  }

  return (
    <main className="relative flex h-full min-h-0 flex-1 flex-col bg-background pt-5 text-foreground md:pt-6">
      <header
        className="flex shrink-0 items-center px-3 pb-3 md:px-5"
        // Why: no stacked center titlebar on this page; keep the title clear of Windows/Linux window controls.
        style={
          {
            paddingRight: 'max(0.75rem, var(--window-controls-width, 0px))'
          } as React.CSSProperties
        }
      >
        <h1 className="truncate text-base font-semibold leading-8">
          {translate('auto.components.artifacts.ArtifactsPage.title', 'Artifacts')}
        </h1>
      </header>

      {error ? (
        <ArtifactsPageErrorBanner
          error={error}
          loading={loading}
          onRetry={() => void loadArtifacts()}
        />
      ) : null}
      {!signedIn ? (
        <ArtifactsPageAuthState
          needsReconnect={needsReconnect}
          configured={authStatus?.configured === true}
          onConnect={() => void connect()}
          onOpenAccountSettings={openAccountSettings}
        />
      ) : loading && artifacts.length === 0 ? (
        <ArtifactsPageSkeleton />
      ) : artifacts.length === 0 ? (
        <ArtifactsPageEmptyState
          hasMore={Boolean(nextCursor)}
          loadingMore={loadingMore}
          publishingBlocked={publishingBlocked}
          onLoadMore={() => void loadMoreArtifacts()}
          onOpenArtifactsSettings={() => {
            openSettingsTarget({ pane: 'artifacts', repoId: null })
            openSettingsPage()
          }}
        />
      ) : (
        <ArtifactCollection
          search={{ query, onChange: setQuery }}
          artifacts={artifacts}
          deletingId={deletingId}
          selectedSlug={selectedSlug}
          selectArtifact={setSelectedSlug}
          deleteArtifact={(target) => void deleteArtifact(target)}
          hasMore={Boolean(nextCursor)}
          loadingMore={loadingMore}
          loadMore={() => void loadMoreArtifacts()}
          onRefresh={() => void loadArtifacts()}
          isRefreshing={loading}
        />
      )}

      <ArtifactDetailDrawer
        item={selectedArtifact}
        deleting={deletingId === selectedArtifact?.artifact.slug}
        onClose={() => setSelectedSlug(null)}
        onDelete={(target) => void deleteArtifact(target)}
      />
    </main>
  )
}
