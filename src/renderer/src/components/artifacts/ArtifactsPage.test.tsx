// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import type * as ConfirmationDialogModule from '@/components/confirmation-dialog-context'
import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmationDialogProvider } from '@/components/confirmation-dialog'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ArtifactViewerActionSchema } from '../../../../shared/artifact-viewer-command'
import type { OrcaProfileAuthStatus } from '../../../../shared/orca-profiles'

const mocks = vi.hoisted(() => ({
  authStatus: {
    activeProfileId: 'profile-a',
    cloud: { cloudProfileId: 'cloud-a', userId: 'user-a' },
    configured: true,
    state: 'connected'
  } as Record<string, unknown>,
  closePage: vi.fn(),
  setBlockingSurface: vi.fn(),
  connect: vi.fn(),
  confirm: vi.fn(),
  refreshAuth: vi.fn(),
  rpc: vi.fn(),
  settings: {
    artifactSharingEnabled: true,
    skipDeleteArtifactConfirm: false
  } as Record<string, unknown> | null,
  updateSettings: vi.fn(),
  openSettingsPage: vi.fn(),
  openSettingsTarget: vi.fn(),
  resolvePartition: vi.fn(),
  writeClipboardText: vi.fn(),
  openUrl: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn()
}))

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError }
}))

vi.mock('@/components/confirmation-dialog-context', async (importOriginal) => {
  const actual = await importOriginal<typeof ConfirmationDialogModule>()
  const { useContext } = await import('react')
  return {
    ...actual,
    useConfirmationDialog: () => useContext(actual.ConfirmationDialogContext) ?? mocks.confirm
  }
})

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: mocks.rpc
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) => selector(storeState()),
    { getState: storeState }
  )
}))

function storeState(): Record<string, unknown> {
  return {
    closeArtifactsPage: mocks.closePage,
    setContextualToursBlockingSurfaceVisible: mocks.setBlockingSurface,
    connectCurrentOrcaProfile: mocks.connect,
    orcaProfileAuthStatus: mocks.authStatus,
    refreshCurrentOrcaProfileAuth: mocks.refreshAuth,
    settings: mocks.settings,
    updateSettings: mocks.updateSettings,
    openSettingsPage: mocks.openSettingsPage,
    openSettingsTarget: mocks.openSettingsTarget
  }
}

import ArtifactsPage from './ArtifactsPage'
import { applyArtifactViewerAction } from '../../runtime/artifact-viewer-controller'
import { artifactAccountIdentity } from './useArtifactPagination'

describe('ArtifactsPage', () => {
  beforeEach(() => {
    mocks.authStatus = {
      activeProfileId: 'profile-a',
      cloud: { cloudProfileId: 'cloud-a', userId: 'user-a' },
      configured: true,
      state: 'connected'
    }
    mocks.closePage.mockReset()
    mocks.connect.mockReset()
    mocks.confirm.mockReset()
    mocks.refreshAuth.mockReset()
    mocks.rpc.mockReset()
    mocks.settings = { artifactSharingEnabled: true, skipDeleteArtifactConfirm: false }
    mocks.updateSettings.mockReset().mockResolvedValue(undefined)
    mocks.openSettingsPage.mockReset()
    mocks.openSettingsTarget.mockReset()
    mocks.resolvePartition.mockReset().mockResolvedValue('persist:orca-default')
    mocks.writeClipboardText.mockReset().mockResolvedValue(undefined)
    mocks.openUrl.mockReset().mockResolvedValue(undefined)
    mocks.toastSuccess.mockReset()
    mocks.toastError.mockReset()
    Object.assign(window, {
      api: {
        browser: { sessionResolvePartition: mocks.resolvePartition },
        ui: { writeClipboardText: mocks.writeClipboardText },
        shell: { openUrl: mocks.openUrl }
      }
    })
    mocks.rpc.mockResolvedValue({
      status: 'ok',
      value: {
        artifacts: [
          {
            artifact: {
              byteSize: 1024,
              createdAt: '2026-08-01T12:00:00.000Z',
              deletedAt: null,
              expiresAt: '2026-09-01T12:00:00.000Z',
              originalFileName: 'report.html',
              renderedContentType: 'text/html',
              slug: 'report-123',
              sourceContentType: 'text/html',
              title: 'Quarterly report',
              updatedAt: '2026-08-02T12:00:00.000Z',
              version: 1
            },
            shareUrl: 'https://share.onorca.dev/a/report-123'
          }
        ]
      }
    })
  })

  afterEach(cleanup)

  it('applies viewer query and detail selection to the mounted page before acknowledging', async () => {
    render(<ArtifactsPage />)
    await screen.findByRole('button', { name: /Quarterly report/ })
    let request: ReturnType<typeof applyArtifactViewerAction> | undefined
    act(() => {
      request = applyArtifactViewerAction({ kind: 'query', value: 'no match' })
    })
    await expect(request).resolves.toMatchObject({ query: 'no match', visibleSlugs: [] })
    expect(screen.getByPlaceholderText('Search...')).toHaveValue('no match')
    expect(screen.getByText('No matches')).toBeInTheDocument()
    act(() => {
      request = applyArtifactViewerAction({ kind: 'query', value: '' })
    })
    await request
    act(() => {
      request = applyArtifactViewerAction({ kind: 'select', slug: 'report-123' })
    })
    await expect(request).resolves.toMatchObject({ selectedSlug: 'report-123' })
    expect(screen.getByRole('heading', { level: 2, name: 'Quarterly report' })).toBeInTheDocument()
    act(() => {
      request = applyArtifactViewerAction({ kind: 'select', slug: null })
    })
    await expect(request).resolves.toMatchObject({ selectedSlug: null })
    expect(screen.queryByRole('heading', { level: 2, name: 'Quarterly report' })).toBeNull()
  })

  async function applyPage(action: unknown) {
    let request: ReturnType<typeof applyArtifactViewerAction> | undefined
    await act(async () => {
      request = applyArtifactViewerAction(ArtifactViewerActionSchema.parse(action))
      void request.catch(() => undefined)
    })
    return request
  }
  const reviewedPageTarget = async () =>
    z.object({ targetToken: z.string() }).parse(await applyPage({ kind: 'get' })).targetToken

  it('copies and opens the reviewed loaded detail through the actual link callbacks', async () => {
    render(<ArtifactsPage />)
    await screen.findByRole('button', { name: /Quarterly report/ })
    await applyPage({ kind: 'select', slug: 'report-123' })
    const reviewedTarget = await reviewedPageTarget()
    const target = {
      slug: 'report-123',
      reviewedTarget,
      reviewedLink: 'https://share.onorca.dev/a/report-123'
    }
    await applyPage({ kind: 'copy-link', ...target })
    expect(mocks.writeClipboardText).toHaveBeenCalledExactlyOnceWith(target.reviewedLink)
    await applyPage({ kind: 'open-link', ...target })
    expect(mocks.openUrl).toHaveBeenCalledExactlyOnceWith(target.reviewedLink)
    await expect(
      applyPage({ kind: 'copy-link', ...target, reviewedLink: 'https://example.com/stale' })
    ).rejects.toThrow('viewer_target_changed')
    mocks.openUrl.mockRejectedValueOnce(new Error('fixture-secret'))
    await expect(applyPage({ kind: 'open-link', ...target })).rejects.toThrow(
      'artifact_link_action_failed'
    )
    await applyPage({ kind: 'select', slug: null })
    await expect(applyPage({ kind: 'copy-link', ...target })).rejects.toThrow(
      'artifact_detail_closed'
    )
  })
  it('rejects pending native actions and stale reviews when the account changes', async () => {
    const view = render(<ArtifactsPage />)
    await screen.findByRole('button', { name: /Quarterly report/ })
    await applyPage({ kind: 'select', slug: 'report-123' })
    const reviewedTarget = await reviewedPageTarget()
    const action = {
      kind: 'open-link',
      slug: 'report-123',
      reviewedTarget,
      reviewedLink: 'https://share.onorca.dev/a/report-123'
    }
    let finish: (() => void) | undefined
    mocks.openUrl.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve
      })
    )
    let pending: ReturnType<typeof applyArtifactViewerAction> | undefined
    await act(async () => {
      pending = applyArtifactViewerAction(ArtifactViewerActionSchema.parse(action))
      void pending.catch(() => undefined)
    })
    await expect(applyPage({ kind: 'query', value: 'busy' })).rejects.toThrow('viewer_busy')
    mocks.authStatus = { activeProfileId: 'profile-b', configured: true, state: 'connected' }
    view.rerender(<ArtifactsPage />)
    await expect(pending).rejects.toThrow('viewer_target_changed')
    await act(async () => finish?.())
    await applyPage({ kind: 'select', slug: 'report-123' })
    await expect(applyPage(action)).rejects.toThrow('viewer_target_changed')
    expect(mocks.openUrl).toHaveBeenCalledOnce()
  })

  it('opens only available settings and starts the existing sign-in flow without enabling sharing', async () => {
    mocks.authStatus = { configured: false, state: 'local' }
    const view = render(<ArtifactsPage />)
    await applyPage({ kind: 'open-account-settings' })
    expect(mocks.openSettingsTarget).toHaveBeenCalledWith({ pane: 'orca-account', repoId: null })
    await expect(applyPage({ kind: 'connect' })).rejects.toThrow('artifact_connect_unavailable')
    mocks.authStatus = { configured: true, state: 'local' }
    view.rerender(<ArtifactsPage />)
    mocks.connect.mockResolvedValueOnce({ status: 'cancelled' })
    await expect(applyPage({ kind: 'connect' })).rejects.toThrow(
      'artifact_account_connection_not_completed'
    )
    mocks.connect.mockResolvedValueOnce({ status: 'connected' })
    await applyPage({ kind: 'connect' })
    expect(mocks.connect).toHaveBeenCalledTimes(2)
    mocks.authStatus = { activeProfileId: 'profile-a', configured: true, state: 'connected' }
    mocks.settings = { artifactSharingEnabled: false }
    mocks.rpc.mockResolvedValue({ status: 'ok', value: { artifacts: [] } })
    view.rerender(<ArtifactsPage />)
    await screen.findByText('Publishing is turned off')
    await applyPage({ kind: 'open-artifacts-settings' })
    expect(mocks.openSettingsTarget).toHaveBeenLastCalledWith({ pane: 'artifacts', repoId: null })
    expect(mocks.updateSettings).not.toHaveBeenCalled()
  })

  it('settles only the reviewed artifact deletion through the existing confirmation dialog', async () => {
    render(
      <ConfirmationDialogProvider>
        <ArtifactsPage />
      </ConfirmationDialogProvider>
    )
    await screen.findByRole('button', { name: /Quarterly report/ })
    await applyPage({ kind: 'select', slug: 'report-123' })
    const reviewedTarget = await reviewedPageTarget()
    const target = {
      slug: 'report-123',
      reviewedTarget,
      reviewedLink: 'https://share.onorca.dev/a/report-123'
    }
    let deletion: ReturnType<typeof applyArtifactViewerAction> | undefined
    async function start() {
      await act(async () => {
        deletion = applyArtifactViewerAction(
          ArtifactViewerActionSchema.parse({ kind: 'delete', ...target })
        )
        void deletion.catch(() => undefined)
      })
      await screen.findByRole('dialog', { name: 'Delete artifact?' })
    }
    await start()
    await expect(applyPage({ kind: 'get' })).resolves.toMatchObject({ busy: true })
    await expect(
      applyPage({
        kind: 'delete-confirmation',
        slug: target.slug,
        reviewedTarget: '00000000-0000-4000-8000-000000000001',
        confirmed: true
      })
    ).rejects.toThrow('viewer_target_changed')
    await applyPage({
      kind: 'delete-confirmation',
      slug: target.slug,
      reviewedTarget,
      confirmed: false
    })
    await expect(deletion).rejects.toThrow('artifact_delete_not_completed')
    expect(mocks.rpc.mock.calls.filter((call) => call[1] === 'artifacts.delete')).toHaveLength(0)
    await start()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.rpc.mockRejectedValueOnce(new Error('fixture-secret'))
    await applyPage({
      kind: 'delete-confirmation',
      slug: target.slug,
      reviewedTarget,
      confirmed: true
    })
    await expect(deletion).rejects.toThrow('artifact_delete_not_completed')
    expect(errors.mock.calls.flat().map(String).join(' ')).not.toContain('fixture-secret')
    expect(JSON.stringify(await applyPage({ kind: 'get' }))).not.toContain('fixture-secret')
    expect(screen.getByRole('heading', { level: 2, name: 'Quarterly report' })).toBeTruthy()
    await start()
    mocks.rpc.mockResolvedValueOnce({ status: 'ok', value: undefined })
    await applyPage({
      kind: 'delete-confirmation',
      slug: target.slug,
      reviewedTarget,
      confirmed: true
    })
    await expect(deletion).resolves.toMatchObject({ loadedSlugs: [], selectedSlug: null })
    expect(mocks.rpc).toHaveBeenLastCalledWith({ kind: 'local' }, 'artifacts.delete', {
      id: 'report-123'
    })
    expect(screen.queryByRole('button', { name: /Quarterly report/ })).toBeNull()
  })

  it.each(['unmount', 'account'] as const)(
    'cancels the actual pending confirmation on %s changes',
    async (mode) => {
      const view = render(
        <ConfirmationDialogProvider>
          <ArtifactsPage />
        </ConfirmationDialogProvider>
      )
      await screen.findByRole('button', { name: /Quarterly report/ })
      await applyPage({ kind: 'select', slug: 'report-123' })
      const reviewedTarget = await reviewedPageTarget()
      let deletion: ReturnType<typeof applyArtifactViewerAction> | undefined
      await act(async () => {
        deletion = applyArtifactViewerAction(
          ArtifactViewerActionSchema.parse({
            kind: 'delete',
            slug: 'report-123',
            reviewedTarget,
            reviewedLink: 'https://share.onorca.dev/a/report-123'
          })
        )
        void deletion.catch(() => undefined)
      })
      await screen.findByRole('dialog', { name: 'Delete artifact?' })
      await act(async () => {
        if (mode === 'unmount') {
          view.unmount()
        } else {
          mocks.authStatus = { activeProfileId: 'profile-b', configured: true, state: 'connected' }
          view.rerender(
            <ConfirmationDialogProvider>
              <ArtifactsPage />
            </ConfirmationDialogProvider>
          )
        }
      })
      await expect(deletion).rejects.toThrow(
        mode === 'unmount' ? 'viewer_unmounted' : 'viewer_target_changed'
      )
      await expect(
        applyPage({
          kind: 'delete-confirmation',
          slug: 'report-123',
          reviewedTarget,
          confirmed: true
        })
      ).rejects.toThrow('viewer_unavailable')
      expect(mocks.rpc.mock.calls.filter((call) => call[1] === 'artifacts.delete')).toHaveLength(0)
    }
  )

  it('loads the current viewer cursor and acknowledges the appended page', async () => {
    mocks.rpc.mockReset()
    mocks.rpc
      .mockResolvedValueOnce({
        status: 'ok',
        value: { artifacts: [artifactListItem('First page', 'first')], nextCursor: 'page-two' }
      })
      .mockResolvedValueOnce({
        status: 'ok',
        value: { artifacts: [artifactListItem('Second page', 'second')] }
      })
    render(<ArtifactsPage />)
    await screen.findByRole('button', { name: /First page/ })
    let request: ReturnType<typeof applyArtifactViewerAction> | undefined
    await act(async () => {
      request = applyArtifactViewerAction({ kind: 'load-more' })
    })
    await expect(request).resolves.toMatchObject({
      loadedSlugs: ['first', 'second'],
      hasMore: false
    })
    expect(screen.getByRole('button', { name: /Second page/ })).toBeInTheDocument()
    expect(mocks.rpc).toHaveBeenLastCalledWith({ kind: 'local' }, 'artifacts.list', {
      cursor: 'page-two'
    })
  })

  it('renders the selected artifact in a right drawer with copy link as the primary action', async () => {
    render(<ArtifactsPage />)

    const row = await screen.findByRole('button', { name: /Quarterly report/ })
    expect(row).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Quarterly report' })).toBeNull()
    const title = screen.getByRole('heading', { level: 1, name: 'Artifacts' })
    expect(title).toHaveClass('text-base', 'font-semibold', 'leading-8')
    expect(title.closest('header')).toHaveClass('px-3', 'pb-3', 'md:px-5')
    expect(screen.getByRole('main')).toHaveClass('pt-5', 'md:pt-6')
    expect(screen.queryByRole('button', { name: 'Close artifacts' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveClass('border', 'border-border')

    fireEvent.click(row)
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Quarterly report' })
    ).toBeInTheDocument()
    expect(document.querySelector('[data-slot="sheet-content"]')).toHaveClass(
      'w-[min(96rem,calc(100vw-var(--mac-traffic-lights-width,0px)))]'
    )
    // Why: the drawer is right-anchored under the fixed Windows/Linux window-controls
    // overlay, so its actions must sit inside an element inset past that overlay.
    expect(
      screen
        .getByRole('button', { name: 'Close' })
        .closest('.pr-\\[max\\(1rem\\,var\\(--window-controls-width\\,0px\\)\\)\\]')
    ).not.toBeNull()
    const copyButton = screen.getByRole('button', { name: 'Copy link' })
    expect(copyButton).toHaveAttribute('data-variant', 'default')
    expect(copyButton.parentElement).toHaveAttribute('aria-label', 'Artifact actions')
    expect(screen.getByRole('button', { name: 'Open in browser' })).toHaveAttribute(
      'data-variant',
      'ghost'
    )
    expect(screen.queryByRole('button', { name: 'Delete artifact' })).toBeNull()
    expect(screen.getByRole('button', { name: 'More artifact actions' })).toBeInTheDocument()

    await waitFor(() => {
      const preview = document.querySelector('webview[aria-label="Artifact preview"]')
      expect(preview).toHaveAttribute('partition', 'persist:orca-default')
      expect(preview).toHaveAttribute('src', 'https://share.onorca.dev/a/report-123?embed=1')
    })

    fireEvent.click(copyButton)
    await waitFor(() =>
      expect(mocks.writeClipboardText).toHaveBeenCalledWith('https://share.onorca.dev/a/report-123')
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Artifact link copied')

    fireEvent.click(screen.getByRole('button', { name: 'Open in browser' }))
    expect(mocks.openUrl).toHaveBeenCalledWith('https://share.onorca.dev/a/report-123')
  })

  it('shows a fallback when the desktop preview session is unavailable', async () => {
    mocks.resolvePartition.mockResolvedValue(null)
    render(<ArtifactsPage />)

    fireEvent.click(await screen.findByRole('button', { name: /Quarterly report/ }))
    expect(await screen.findByText('Preview unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Open in browser' })).toBeEnabled()
  })

  it('closes the drawer on Escape, then the page', async () => {
    render(<ArtifactsPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Quarterly report/ }))
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Quarterly report' })
    ).toBeInTheDocument()

    fireEvent.keyDown(document.querySelector('[data-slot="sheet-content"]') as Element, {
      key: 'Escape'
    })
    await waitFor(() =>
      expect(screen.queryByRole('heading', { level: 2, name: 'Quarterly report' })).toBeNull()
    )
    expect(mocks.closePage).not.toHaveBeenCalled()

    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(mocks.closePage).toHaveBeenCalledOnce()
  })

  it('explains the agent-first sharing workflow', async () => {
    mocks.rpc.mockResolvedValue({ status: 'ok', value: { artifacts: [] } })
    render(<ArtifactsPage />)

    const heading = await screen.findByText('No shared artifacts')
    expect(heading.parentElement).toHaveClass('flex-1', 'justify-center')
    expect(
      screen.getByText(
        'Open an HTML or Markdown file and select Share as artifact, or ask your agent to share it.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(/orca artifacts share/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Open Settings → Artifacts' })
    ).not.toBeInTheDocument()
  })

  it('sends the user to Settings instead of an agent when publishing is off', async () => {
    mocks.settings = { artifactSharingEnabled: false }
    mocks.rpc.mockResolvedValue({ status: 'ok', value: { artifacts: [] } })
    render(<ArtifactsPage />)

    await screen.findByText('Publishing is turned off')
    expect(screen.getByText(/Allow publishing in Settings → Artifacts/)).toBeInTheDocument()
    expect(
      screen.queryByText(
        'Ask your agent to share an HTML or Markdown file, and it will appear here.'
      )
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open Settings → Artifacts' }))
    expect(mocks.openSettingsTarget).toHaveBeenCalledWith({ pane: 'artifacts', repoId: null })
    expect(mocks.openSettingsPage).toHaveBeenCalledOnce()
  })

  it('keeps the neutral empty state until settings have loaded', async () => {
    mocks.settings = null
    mocks.rpc.mockResolvedValue({ status: 'ok', value: { artifacts: [] } })
    render(<ArtifactsPage />)

    await screen.findByText('No shared artifacts')
    expect(screen.queryByText('Publishing is turned off')).not.toBeInTheDocument()
  })

  it('loads each cursor once and appends the next artifact page', async () => {
    let resolveNextPage!: (value: unknown) => void
    mocks.rpc
      .mockResolvedValueOnce({
        status: 'ok',
        value: {
          artifacts: [artifactListItem('First page', 'first-page')],
          nextCursor: 'opaque cursor'
        }
      })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveNextPage = resolve
        })
      )
    render(<ArtifactsPage />)

    await screen.findAllByText('First page')
    const loadMore = screen.getByRole('button', { name: 'Load more' })
    fireEvent.click(loadMore)
    fireEvent.click(loadMore)

    expect(mocks.rpc).toHaveBeenCalledTimes(2)
    expect(mocks.rpc).toHaveBeenLastCalledWith({ kind: 'local' }, 'artifacts.list', {
      cursor: 'opaque cursor'
    })
    resolveNextPage({
      status: 'ok',
      value: { artifacts: [artifactListItem('Second page', 'second-page')] }
    })

    expect(await screen.findByRole('button', { name: /Second page/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /First page/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('can continue from an empty page that has a next cursor', async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        status: 'ok',
        value: { artifacts: [], nextCursor: 'after-empty-page' }
      })
      .mockResolvedValueOnce({
        status: 'ok',
        value: { artifacts: [artifactListItem('Older artifact', 'older-artifact')] }
      })
    render(<ArtifactsPage />)

    expect(await screen.findByText('More artifacts are available')).toBeInTheDocument()
    expect(screen.queryByText('No shared artifacts')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    expect(await screen.findByRole('button', { name: /Older artifact/ })).toBeInTheDocument()
  })

  it('keeps loaded artifacts when loading another page fails', async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        status: 'ok',
        value: {
          artifacts: [artifactListItem('Still visible', 'still-visible')],
          nextCursor: 'next-page'
        }
      })
      .mockRejectedValueOnce(new Error('network down'))
    render(<ArtifactsPage />)

    await screen.findByRole('button', { name: /Still visible/ })
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    expect(await screen.findByText('Could not load more artifacts.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Still visible/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled()
  })

  it('does not surface an initial auth error after the account changes during refresh', async () => {
    let resolveRefresh!: () => void
    mocks.refreshAuth.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRefresh = resolve
      })
    )
    mocks.rpc.mockResolvedValueOnce({ status: 'reconnect-required' }).mockResolvedValueOnce({
      status: 'ok',
      value: { artifacts: [artifactListItem('Account B', 'account-b')] }
    })
    const view = render(<ArtifactsPage />)
    await waitFor(() => expect(mocks.refreshAuth).toHaveBeenCalledOnce())

    mocks.authStatus = {
      activeProfileId: 'profile-b',
      cloud: { cloudProfileId: 'cloud-b', userId: 'user-b' },
      configured: true,
      state: 'connected'
    }
    view.rerender(<ArtifactsPage />)
    expect(await screen.findByRole('button', { name: /Account B/ })).toBeInTheDocument()
    resolveRefresh()

    await waitFor(() =>
      expect(screen.queryByText('Sign in to Orca again to load artifacts.')).not.toBeInTheDocument()
    )
  })

  it('does not surface a load-more auth error after switching accounts during refresh', async () => {
    let resolveRefresh!: () => void
    mocks.refreshAuth.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRefresh = resolve
      })
    )
    mocks.rpc
      .mockResolvedValueOnce({
        status: 'ok',
        value: {
          artifacts: [artifactListItem('Account A', 'account-a')],
          nextCursor: 'account-a-next'
        }
      })
      .mockResolvedValueOnce({ status: 'reconnect-required' })
      .mockResolvedValueOnce({
        status: 'ok',
        value: { artifacts: [artifactListItem('Account B', 'account-b')] }
      })
    const view = render(<ArtifactsPage />)
    await screen.findAllByText('Account A')
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(mocks.refreshAuth).toHaveBeenCalledOnce())

    mocks.authStatus = {
      activeProfileId: 'profile-b',
      cloud: { cloudProfileId: 'cloud-b', userId: 'user-b' },
      configured: true,
      state: 'connected'
    }
    view.rerender(<ArtifactsPage />)
    expect(await screen.findByRole('button', { name: /Account B/ })).toBeInTheDocument()
    resolveRefresh()

    await waitFor(() =>
      expect(screen.queryByText('Sign in to Orca again to load artifacts.')).not.toBeInTheDocument()
    )
  })

  it('never renders artifacts loaded for a previous account', async () => {
    let resolveFirst!: (value: unknown) => void
    mocks.rpc.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve
      })
    )
    const view = render(<ArtifactsPage />)

    mocks.authStatus = {
      activeProfileId: 'profile-b',
      cloud: { cloudProfileId: 'cloud-b', userId: 'user-b' },
      configured: true,
      state: 'connected'
    }
    mocks.rpc.mockResolvedValueOnce({ status: 'ok', value: { artifacts: [] } })
    view.rerender(<ArtifactsPage />)
    resolveFirst({
      status: 'ok',
      value: {
        artifacts: [
          {
            artifact: {
              byteSize: 1,
              createdAt: '2026-08-01T12:00:00.000Z',
              deletedAt: null,
              expiresAt: '2026-09-01T12:00:00.000Z',
              originalFileName: 'account-a-secret.html',
              renderedContentType: 'text/html',
              slug: 'account-a-secret',
              sourceContentType: 'text/html',
              title: 'Account A secret',
              updatedAt: '2026-08-02T12:00:00.000Z',
              version: 1
            },
            shareUrl: 'https://share.onorca.dev/a/account-a-secret'
          }
        ]
      }
    })

    await screen.findByText('No shared artifacts')
    expect(screen.queryByText('Account A secret')).not.toBeInTheDocument()
  })

  it('does not apply a completed deletion to a new account', async () => {
    let resolveDelete!: (value: unknown) => void
    mocks.confirm.mockResolvedValue(true)
    mocks.rpc.mockResolvedValueOnce({
      status: 'ok',
      value: { artifacts: [artifactListItem('Shared slug A', 'shared-slug')] }
    })
    mocks.rpc.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDelete = resolve
      })
    )
    const view = render(<ArtifactsPage />)

    await screen.findAllByText('Shared slug A')
    await deleteFirstArtifactFromDrawerMenu()
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2))

    mocks.authStatus = {
      activeProfileId: 'profile-b',
      cloud: { cloudProfileId: 'cloud-b', userId: 'user-b' },
      configured: true,
      state: 'connected'
    }
    mocks.rpc.mockResolvedValueOnce({
      status: 'ok',
      value: { artifacts: [artifactListItem('Shared slug B', 'shared-slug')] }
    })
    view.rerender(<ArtifactsPage />)
    resolveDelete({ status: 'ok', value: undefined })

    expect(await screen.findByRole('button', { name: /Shared slug B/ })).toBeInTheDocument()
  })

  it('does not resurrect a deletion from an older refresh', async () => {
    let resolveRefresh!: (value: unknown) => void
    mocks.confirm.mockResolvedValue(true)
    mocks.rpc
      .mockResolvedValueOnce({
        status: 'ok',
        value: { artifacts: [artifactListItem('Delete me', 'delete-me')] }
      })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRefresh = resolve
        })
      )
      .mockResolvedValueOnce({ status: 'ok', value: undefined })
    render(<ArtifactsPage />)

    await screen.findAllByText('Delete me')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await deleteFirstArtifactFromDrawerMenu()
    await waitFor(() => expect(screen.queryByText('Delete me')).not.toBeInTheDocument())
    resolveRefresh({
      status: 'ok',
      value: { artifacts: [artifactListItem('Delete me', 'delete-me')] }
    })

    await waitFor(() => expect(screen.queryByText('Delete me')).not.toBeInTheDocument())
  })

  it('skips the delete confirmation once the preference is saved', async () => {
    mocks.settings = { skipDeleteArtifactConfirm: true }
    mocks.rpc.mockResolvedValue({
      status: 'ok',
      value: { artifacts: [artifactListItem('Skip me', 'skip-me')] }
    })
    render(<ArtifactsPage />)
    await screen.findByRole('button', { name: /Skip me/ })

    mocks.rpc.mockResolvedValueOnce({ status: 'ok', value: undefined })
    await deleteFirstArtifactFromDrawerMenu()

    await waitFor(() => expect(screen.queryByRole('button', { name: /Skip me/ })).toBeNull())
    expect(mocks.confirm).not.toHaveBeenCalled()
  })

  it('persists the skip preference only when the confirmation is accepted', async () => {
    mocks.confirm.mockResolvedValue(true)
    mocks.rpc.mockResolvedValue({
      status: 'ok',
      value: { artifacts: [artifactListItem('Ask me', 'ask-me')] }
    })
    render(<ArtifactsPage />)
    await screen.findByRole('button', { name: /Ask me/ })

    mocks.rpc.mockResolvedValueOnce({ status: 'ok', value: undefined })
    await deleteFirstArtifactFromDrawerMenu()
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce())

    // Why: the dialog owns the checkbox; the page only supplies what to persist when it is checked.
    const options = mocks.confirm.mock.calls[0]?.[0] as {
      dontAskAgain?: { onConfirmed: () => void }
    }
    expect(mocks.updateSettings).not.toHaveBeenCalled()
    options.dontAskAgain?.onConfirmed()
    expect(mocks.updateSettings).toHaveBeenCalledWith({ skipDeleteArtifactConfirm: true })
  })

  it('treats an organization switch as an account identity change', () => {
    const status = {
      activeProfileId: 'profile-a',
      cloud: {
        activeOrgId: 'org-a',
        cloudProfileId: 'cloud-a',
        email: 'a@example.com',
        linkedAt: 1,
        userId: 'user-a'
      },
      configured: true,
      persistence: 'encrypted',
      state: 'connected'
    } satisfies OrcaProfileAuthStatus

    expect(artifactAccountIdentity(status)).not.toBe(
      artifactAccountIdentity({ ...status, cloud: { ...status.cloud, activeOrgId: 'org-b' } })
    )
  })
})

/** Opens the drawer from the first rendered row, then deletes through the drawer's action menu. */
async function deleteFirstArtifactFromDrawerMenu(): Promise<void> {
  const row = document.querySelector('[data-slot="context-menu-trigger"]')
  if (!(row instanceof HTMLElement)) {
    throw new Error('Expected an artifact row')
  }
  await userEvent.click(row)
  await userEvent.click(screen.getByRole('button', { name: 'More artifact actions' }))
  await userEvent.click(screen.getByRole('menuitem', { name: 'Delete artifact' }))
}

function artifactListItem(title: string, slug: string): Record<string, unknown> {
  return {
    artifact: {
      byteSize: 1,
      createdAt: '2026-08-01T12:00:00.000Z',
      deletedAt: null,
      expiresAt: '2026-09-01T12:00:00.000Z',
      originalFileName: `${slug}.html`,
      renderedContentType: 'text/html',
      slug,
      sourceContentType: 'text/html',
      title,
      updatedAt: '2026-08-02T12:00:00.000Z',
      version: 1
    },
    shareUrl: `https://share.onorca.dev/a/${slug}`
  }
}
