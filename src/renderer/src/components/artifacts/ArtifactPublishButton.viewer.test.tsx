// @vitest-environment happy-dom
import { useRef, useState } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { ArtifactViewerActionSchema } from '../../../../shared/artifact-viewer-command'
import { applyArtifactViewerAction } from '@/runtime/artifact-viewer-controller'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ArtifactPublishButton } from './ArtifactPublishButton'

const mocks = vi.hoisted(() => {
  const state: Record<string, unknown> = {}
  return {
    listeners: new Set<() => void>(),
    connect: vi.fn(),
    openSettingsPage: vi.fn(),
    openSettingsTarget: vi.fn(),
    rpc: vi.fn(),
    copy: vi.fn(),
    openLink: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    state
  }
})
vi.mock('@/store', async () => {
  const { useSyncExternalStore } = await import('react')
  function useAppStore(selector: (state: Record<string, unknown>) => unknown) {
    return useSyncExternalStore(
      (listener) => {
        mocks.listeners.add(listener)
        return () => {
          mocks.listeners.delete(listener)
        }
      },
      () => selector(mocks.state)
    )
  }
  useAppStore.getState = () => mocks.state
  return { useAppStore }
})
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: mocks.rpc }))
vi.mock('./artifact-link-actions', () => ({
  copyArtifactLink: mocks.copy,
  openArtifactInBrowser: mocks.openLink
}))
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }))
const sourceKey = '/fixture/report.md'
const request = {
  sourceKey,
  content: '# Unsaved draft',
  contentType: 'text/markdown' as const,
  fileName: 'report.md'
}
const published = {
  change: 'created',
  item: { artifact: { slug: 'fixture-report' }, shareUrl: 'https://example.com/a/fixture-report' }
}
const connected = {
  state: 'connected',
  configured: true,
  activeProfileId: 'profile-a',
  cloud: { userId: 'user-a', cloudProfileId: 'cloud-a', activeOrgId: null }
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.state = {
    orcaProfileAuthStatus: connected,
    settings: { artifactSharingEnabled: true },
    connectCurrentOrcaProfile: mocks.connect,
    openSettingsPage: mocks.openSettingsPage,
    openSettingsTarget: mocks.openSettingsTarget
  }
  mocks.rpc.mockImplementation(async (_target: unknown, method: string) => {
    if (method === 'artifacts.getPublishedLink') {
      return { status: 'ok', value: null }
    }
    if (method === 'artifacts.publish') {
      return { status: 'ok', value: published }
    }
    throw new Error('unexpected fixture RPC')
  })
  mocks.copy.mockResolvedValue(true)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  mocks.listeners.clear()
})
async function mount(createRequest = vi.fn().mockResolvedValue(request), disabled = false) {
  await act(async () => {
    render(
      <TooltipProvider>
        <ArtifactPublishButton
          sourceKey={sourceKey}
          createRequest={createRequest}
          disabled={disabled}
        />
      </TooltipProvider>
    )
  })
  return createRequest
}
async function apply(action: unknown) {
  let pending: ReturnType<typeof applyArtifactViewerAction> | undefined
  await act(async () => {
    pending = applyArtifactViewerAction(
      ArtifactViewerActionSchema.parse({ kind: 'publish-form', sourceKey, action })
    )
    void pending.catch(() => undefined)
  })
  return pending
}
async function review() {
  await apply({ kind: 'open', value: true })
  const state = await apply({ kind: 'get' })
  return z.object({ publish: z.object({ targetToken: z.string() }) }).parse(state).publish
    .targetToken
}
it('publishes the actual surface draft after review without needing an Artifacts page', async () => {
  const createRequest = await mount()
  await expect(apply({ kind: 'publish', reviewedTarget: createBrowserUuid() })).rejects.toThrow(
    'artifact_publish_closed'
  )
  const reviewedTarget = await review()
  expect(screen.getByRole('button', { name: 'Generate link' })).toBeTruthy()
  await expect(apply({ kind: 'publish', reviewedTarget })).resolves.toMatchObject({
    publish: { publishedLink: published.item.shareUrl, publishing: false }
  })
  expect(createRequest).toHaveBeenCalledOnce()
  expect(mocks.rpc).toHaveBeenCalledWith({ kind: 'local' }, 'artifacts.publish', request)
  expect(screen.getByRole('button', { name: 'Update shared content' })).toBeTruthy()
  await apply({ kind: 'open', value: false })
  expect(screen.queryByRole('button', { name: 'Update shared content' })).toBeNull()
})
it('protects device publishing permission and routes only to the existing settings pane', async () => {
  mocks.state.settings = { artifactSharingEnabled: false }
  const createRequest = await mount()
  const reviewedTarget = await review()
  await expect(apply({ kind: 'publish', reviewedTarget })).rejects.toThrow(
    'artifact_sharing_disabled'
  )
  await apply({ kind: 'open-settings' })
  expect(mocks.openSettingsTarget).toHaveBeenCalledWith({ pane: 'artifacts', repoId: null })
  expect(mocks.openSettingsPage).toHaveBeenCalledOnce()
  expect(mocks.state.settings).toEqual({ artifactSharingEnabled: false })
  expect(createRequest).not.toHaveBeenCalled()
})
it('rejects stale account review before preparing content', async () => {
  const createRequest = await mount()
  const reviewedTarget = await review()
  await act(async () => {
    mocks.state.orcaProfileAuthStatus = { ...connected, activeProfileId: 'profile-b' }
    for (const listener of mocks.listeners) {
      listener()
    }
  })
  await expect(apply({ kind: 'publish', reviewedTarget })).rejects.toThrow('viewer_target_changed')
  expect(createRequest).not.toHaveBeenCalled()
})
it('blocks a disabled surface and rejects pending preparation on unmount', async () => {
  await mount(undefined, true)
  await expect(apply({ kind: 'open', value: true })).rejects.toThrow('artifact_publish_disabled')
  await act(async () => cleanup())
  let finish: ((value: typeof request) => void) | undefined
  await mount(
    vi.fn().mockReturnValue(
      new Promise<typeof request>((resolve) => {
        finish = resolve
      })
    )
  )
  const reviewedTarget = await review()
  let pending: ReturnType<typeof applyArtifactViewerAction> | undefined
  await act(async () => {
    pending = applyArtifactViewerAction(
      ArtifactViewerActionSchema.parse({
        kind: 'publish-form',
        sourceKey,
        action: { kind: 'publish', reviewedTarget }
      })
    )
    void pending.catch(() => undefined)
  })
  await expect(apply({ kind: 'get' })).resolves.toMatchObject({ publish: { publishing: true } })
  await expect(apply({ kind: 'open', value: false })).rejects.toThrow('viewer_busy')
  await act(async () => cleanup())
  await expect(pending).rejects.toThrow('viewer_unmounted')
  await act(async () => finish?.(request))
  expect(mocks.rpc.mock.calls.filter((call) => call[1] === 'artifacts.publish')).toHaveLength(0)
})

it('does not send prepared content after its account changes during preparation', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  let finish: ((value: typeof request) => void) | undefined
  await mount(
    vi.fn().mockReturnValue(
      new Promise<typeof request>((resolve) => {
        finish = resolve
      })
    )
  )
  const reviewedTarget = await review()
  let pending: ReturnType<typeof applyArtifactViewerAction> | undefined
  await act(async () => {
    pending = applyArtifactViewerAction(
      ArtifactViewerActionSchema.parse({
        kind: 'publish-form',
        sourceKey,
        action: { kind: 'publish', reviewedTarget }
      })
    )
    void pending.catch(() => undefined)
  })
  await act(async () => {
    mocks.state.orcaProfileAuthStatus = { ...connected, activeProfileId: 'profile-b' }
    for (const listener of mocks.listeners) {
      listener()
    }
  })
  await expect(pending).rejects.toThrow('viewer_target_changed')
  await act(async () => finish?.(request))
  expect(mocks.rpc.mock.calls.filter((call) => call[1] === 'artifacts.publish')).toHaveLength(0)
})
it('keeps lookup failures private and retries the actual lookup', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  mocks.rpc.mockRejectedValueOnce(new Error('fixture-secret'))
  await mount()
  await apply({ kind: 'open', value: true })
  await expect(apply({ kind: 'get' })).resolves.toMatchObject({
    publish: { lookupStatus: 'error' }
  })
  expect(errors.mock.calls.flat().map(String).join('\n')).not.toContain('fixture-secret')
  await expect(apply({ kind: 'retry' })).resolves.toMatchObject({
    publish: { lookupStatus: 'loaded' }
  })
  expect(
    mocks.rpc.mock.calls.filter((call) => call[1] === 'artifacts.getPublishedLink')
  ).toHaveLength(2)
})
it('does not expose publication errors or draft secrets', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  await mount(vi.fn().mockResolvedValue({ ...request, authToken: 'fixture-secret' }))
  const reviewedTarget = await review()
  mocks.rpc.mockRejectedValueOnce(new Error('fixture-secret'))
  await expect(apply({ kind: 'publish', reviewedTarget })).rejects.toThrow(
    'artifact_publish_failed'
  )
  expect(errors.mock.calls.flat().map(String).join('\n')).not.toContain('fixture-secret')
  expect(JSON.stringify(await apply({ kind: 'get' }))).not.toContain('fixture-secret')
  expect(JSON.stringify(await apply({ kind: 'get' }))).not.toContain('Unsaved draft')
})

it('rejects a prepared request whose source differs from the reviewed surface', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  await mount(vi.fn().mockResolvedValue({ ...request, sourceKey: '/fixture/other.md' }))
  const reviewedTarget = await review()
  await expect(apply({ kind: 'publish', reviewedTarget })).rejects.toThrow(
    'artifact_publish_failed'
  )
  expect(mocks.rpc.mock.calls.filter((call) => call[1] === 'artifacts.publish')).toHaveLength(0)
})

it('starts the existing account connection without publishing and requires a fresh review afterward', async () => {
  mocks.state.orcaProfileAuthStatus = { ...connected, state: 'local' }
  mocks.connect.mockImplementation(async () => {
    mocks.state.orcaProfileAuthStatus = connected
    for (const listener of mocks.listeners) {
      listener()
    }
    return { status: 'connected' }
  })
  const createRequest = await mount()
  const staleTarget = await review()
  await expect(apply({ kind: 'publish', reviewedTarget: staleTarget })).rejects.toThrow(
    'artifact_account_unavailable'
  )
  await expect(apply({ kind: 'connect' })).resolves.toMatchObject({ publish: { signedIn: true } })
  expect(mocks.connect).toHaveBeenCalledOnce()
  expect(createRequest).not.toHaveBeenCalled()
  await expect(apply({ kind: 'publish', reviewedTarget: staleTarget })).rejects.toThrow(
    'viewer_target_changed'
  )
  const reviewedTarget = await review()
  await apply({ kind: 'publish', reviewedTarget })
  expect(createRequest).toHaveBeenCalledOnce()
})
function AnchoredSurface() {
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <TooltipProvider>
      <button ref={anchorRef}>Overflow</button>
      <ArtifactPublishButton
        sourceKey={sourceKey}
        createRequest={async () => request}
        anchorRef={anchorRef}
        open={open}
        onOpenChange={setOpen}
      />
    </TooltipProvider>
  )
}
it('focuses the actual popover and its controlled anchor without activating a desktop window', async () => {
  await act(async () => {
    render(<AnchoredSurface />)
  })
  await review()
  await apply({ kind: 'focus-content' })
  expect(document.activeElement).toBe(screen.getByRole('dialog'))
  await expect(apply({ kind: 'focus-anchor' })).rejects.toThrow('artifact_popover_open')
  await apply({ kind: 'open', value: false })
  await apply({ kind: 'focus-anchor' })
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Overflow' }))
})

it('copies the reviewed panel link with rendered feedback and opens only that link', async () => {
  mocks.rpc.mockResolvedValueOnce({ status: 'ok', value: { shareUrl: published.item.shareUrl } })
  mocks.openLink.mockResolvedValue(true)
  await mount()
  const reviewedTarget = await review()
  const action = { reviewedTarget, reviewedLink: published.item.shareUrl }
  await expect(apply({ kind: 'copy-link', ...action })).resolves.toMatchObject({
    publish: { copied: true }
  })
  expect(screen.getByRole('button', { name: 'Artifact link copied' })).toBeTruthy()
  expect(mocks.copy).toHaveBeenCalledWith(published.item.shareUrl, { showSuccessToast: false })
  await apply({ kind: 'open-link', ...action })
  expect(mocks.openLink).toHaveBeenCalledExactlyOnceWith(published.item.shareUrl)
  await expect(
    apply({ kind: 'open-link', ...action, reviewedLink: 'https://example.com/stale' })
  ).rejects.toThrow('viewer_target_changed')
  mocks.copy.mockResolvedValueOnce(false)
  await expect(apply({ kind: 'copy-link', ...action })).rejects.toThrow(
    'artifact_link_action_failed'
  )
  mocks.openLink.mockResolvedValueOnce(false)
  await expect(apply({ kind: 'open-link', ...action })).rejects.toThrow(
    'artifact_link_action_failed'
  )
})
it('keeps existing links usable with sharing off and updates through the actual draft publisher', async () => {
  mocks.state.settings = { artifactSharingEnabled: false }
  mocks.rpc.mockResolvedValueOnce({ status: 'ok', value: { shareUrl: published.item.shareUrl } })
  const prepare = await mount()
  const reviewedTarget = await review()
  const action = { reviewedTarget, reviewedLink: published.item.shareUrl }
  await apply({ kind: 'copy-link', ...action })
  await expect(apply({ kind: 'update-link', ...action })).rejects.toThrow(
    'artifact_sharing_disabled'
  )
  expect(prepare).not.toHaveBeenCalled()
  await act(async () => {
    mocks.state.settings = { artifactSharingEnabled: true }
    for (const listener of mocks.listeners) {
      listener()
    }
  })
  await apply({ kind: 'update-link', ...action })
  expect(prepare).toHaveBeenCalledOnce()
  expect(mocks.rpc).toHaveBeenCalledWith({ kind: 'local' }, 'artifacts.publish', request)
})

it('rejects a pending copy on unmount and clears copied feedback timers', async () => {
  mocks.rpc.mockResolvedValueOnce({ status: 'ok', value: { shareUrl: published.item.shareUrl } })
  await mount()
  const reviewedTarget = await review()
  const action = { reviewedTarget, reviewedLink: published.item.shareUrl }
  await apply({ kind: 'copy-link', ...action })
  const clear = vi.spyOn(window, 'clearTimeout')
  let finish: ((value: boolean) => void) | undefined
  mocks.copy.mockReturnValueOnce(
    new Promise<boolean>((resolve) => {
      finish = resolve
    })
  )
  let pending: ReturnType<typeof applyArtifactViewerAction> | undefined
  await act(async () => {
    pending = applyArtifactViewerAction(
      ArtifactViewerActionSchema.parse({
        kind: 'publish-form',
        sourceKey,
        action: { kind: 'copy-link', ...action }
      })
    )
    void pending.catch(() => undefined)
  })
  await expect(apply({ kind: 'get' })).resolves.toMatchObject({ publish: { busy: true } })
  await expect(apply({ kind: 'open', value: false })).rejects.toThrow('viewer_busy')
  await act(async () => cleanup())
  await expect(pending).rejects.toThrow('viewer_unmounted')
  expect(clear).toHaveBeenCalled()
  await act(async () => finish?.(true))
})
