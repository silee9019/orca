// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { TooltipProvider } from '@/components/ui/tooltip'
import { applySkillLinksViewerAction } from '@/runtime/skill-links-viewer-controller'
import { SkillSharedLinksView } from './SkillSharedLinksView'
import type { SkillLinksViewerAction } from '../../../../shared/skill-links-viewer-command'
import { useOwnedSkillShares } from './use-owned-skill-shares'

const share = {
  id: 'shr_fixture',
  url: 'https://example.invalid/share/fixture',
  packageId: 'pkg_fixture',
  name: 'fixture',
  description: '',
  createdAt: '2026-10-08T00:00:00Z'
}
afterEach(() => {
  cleanup()
  useAppStore.setState({ orcaProfileAuthStatus: null })
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'api')
})
it('requires the existing confirmation state before revoking a loaded link', async () => {
  const revokeShare = vi.fn().mockResolvedValue({ status: 'ok', value: undefined })
  const writeClipboardText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      skills: { listOwnedShares: async () => ({ status: 'ok', value: [share] }), revokeShare },
      ui: { writeClipboardText }
    }
  })
  function Viewer() {
    const shares = useOwnedSkillShares()
    return (
      <TooltipProvider>
        <SkillSharedLinksView query="" shares={shares} />
      </TooltipProvider>
    )
  }
  await act(async () => {
    render(<Viewer />)
  })
  await expect(
    applySkillLinksViewerAction({ kind: 'execute', id: share.id, operation: 'revoke' })
  ).rejects.toThrow('confirmation_required')
  let request: ReturnType<typeof applySkillLinksViewerAction> | undefined
  await act(async () => {
    request = applySkillLinksViewerAction({ kind: 'confirm', id: share.id, value: 'revoke' })
  })
  await expect(request).resolves.toMatchObject({ row: { confirming: 'revoke' } })
  expect(revokeShare).not.toHaveBeenCalled()
  await act(async () => {
    request = applySkillLinksViewerAction({ kind: 'copy', id: share.id })
  })
  await request
  expect(writeClipboardText).toHaveBeenCalledExactlyOnceWith(share.url)
  await act(async () => {
    request = applySkillLinksViewerAction({ kind: 'execute', id: share.id, operation: 'revoke' })
  })
  await expect(request).resolves.toMatchObject({ visibleShareIds: [], row: { completed: true } })
  expect(revokeShare).toHaveBeenCalledExactlyOnceWith(share.id)
})

async function apply(action: SkillLinksViewerAction) {
  let request: ReturnType<typeof applySkillLinksViewerAction> | undefined
  await act(async () => {
    request = applySkillLinksViewerAction(action)
    void request.catch(() => undefined)
  })
  return request
}
it('opens loaded contents once, closes them, and deletes only after the matching confirmation', async () => {
  let deleted = false
  const getPackage = vi.fn().mockResolvedValue({ status: 'ok', value: { versions: [] } })
  const deletePackage = vi.fn(async () => {
    deleted = true
    return { status: 'ok', value: undefined }
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      skills: {
        listOwnedShares: async () => ({ status: 'ok', value: deleted ? [] : [share] }),
        getPackage,
        deletePackage
      }
    }
  })
  function Viewer() {
    const shares = useOwnedSkillShares()
    return (
      <TooltipProvider>
        <SkillSharedLinksView query="" shares={shares} />
      </TooltipProvider>
    )
  }
  await act(async () => {
    render(<Viewer />)
  })
  await expect(apply({ kind: 'contents', id: share.id, open: true })).resolves.toMatchObject({
    row: { expanded: true, names: ['fixture'] }
  })
  await expect(apply({ kind: 'contents', id: share.id, open: false })).resolves.toMatchObject({
    row: { expanded: false }
  })
  await apply({ kind: 'contents', id: share.id, open: true })
  expect(getPackage).toHaveBeenCalledExactlyOnceWith(share.packageId)
  await apply({ kind: 'confirm', id: share.id, value: 'revoke' })
  await expect(apply({ kind: 'execute', id: share.id, operation: 'delete' })).rejects.toThrow(
    'confirmation_required'
  )
  expect(deletePackage).not.toHaveBeenCalled()
  await apply({ kind: 'confirm', id: share.id, value: 'delete' })
  await expect(
    apply({ kind: 'execute', id: share.id, operation: 'delete' })
  ).resolves.toMatchObject({ visibleShareIds: [], row: { completed: true } })
  expect(deletePackage).toHaveBeenCalledExactlyOnceWith(share.packageId)
})
it('rejects unavailable contents and declined deletion while retaining the confirmation', async () => {
  const getPackage = vi.fn().mockResolvedValue({ status: 'unsupported' })
  const deletePackage = vi.fn().mockResolvedValue({ status: 'unsupported' })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      skills: {
        listOwnedShares: async () => ({ status: 'ok', value: [share] }),
        getPackage,
        deletePackage
      }
    }
  })
  function Viewer() {
    const shares = useOwnedSkillShares()
    return (
      <TooltipProvider>
        <SkillSharedLinksView query="" shares={shares} />
      </TooltipProvider>
    )
  }
  await act(async () => {
    render(<Viewer />)
  })
  await expect(apply({ kind: 'contents', id: share.id, open: true })).rejects.toThrow(
    'contents_unavailable'
  )
  await apply({ kind: 'confirm', id: share.id, value: 'delete' })
  await expect(apply({ kind: 'execute', id: share.id, operation: 'delete' })).rejects.toThrow(
    'operation_failed'
  )
  await expect(applySkillLinksViewerAction({ kind: 'get' })).resolves.toMatchObject({
    visibleShareIds: [share.id]
  })
  await expect(apply({ kind: 'confirm', id: share.id, value: null })).resolves.toMatchObject({
    row: { confirming: null }
  })
})
it('rejects hidden IDs, busy inventory, and another dialog', async () => {
  const shares = {
    shares: [share],
    loading: false,
    error: null,
    busyShareId: null,
    refresh: async () => undefined,
    revoke: async () => true
  }
  const view = render(
    <TooltipProvider>
      <SkillSharedLinksView query="missing" shares={shares} />
    </TooltipProvider>
  )
  await expect(applySkillLinksViewerAction({ kind: 'copy', id: share.id })).rejects.toThrow(
    'not_visible'
  )
  view.rerender(
    <TooltipProvider>
      <SkillSharedLinksView query="" shares={shares} locked />
    </TooltipProvider>
  )
  await expect(applySkillLinksViewerAction({ kind: 'copy', id: share.id })).rejects.toThrow(
    'viewer_modal_open'
  )
  view.rerender(
    <TooltipProvider>
      <SkillSharedLinksView query="" shares={{ ...shares, loading: true }} />
    </TooltipProvider>
  )
  await expect(applySkillLinksViewerAction({ kind: 'copy', id: share.id })).rejects.toThrow(
    'viewer_busy'
  )
})

it('rejects a stale row acknowledgement after the loaded share changes', async () => {
  let finishCopy: () => void = () => undefined
  const writeClipboardText = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finishCopy = resolve
      })
  )
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ui: { writeClipboardText } }
  })
  const shares = {
    shares: [share],
    loading: false,
    error: null,
    busyShareId: null,
    refresh: async () => undefined,
    revoke: async () => true
  }
  const view = render(
    <TooltipProvider>
      <SkillSharedLinksView query="" shares={shares} />
    </TooltipProvider>
  )
  let request: ReturnType<typeof applySkillLinksViewerAction> | undefined
  await act(async () => {
    request = applySkillLinksViewerAction({ kind: 'copy', id: share.id })
    void request.catch(() => undefined)
  })
  await expect(
    applySkillLinksViewerAction({ kind: 'confirm', id: share.id, value: 'delete' })
  ).rejects.toThrow('viewer_busy')
  view.rerender(
    <TooltipProvider>
      <SkillSharedLinksView
        query=""
        shares={{ ...shares, shares: [{ ...share, packageId: 'pkg_replaced' }] }}
      />
    </TooltipProvider>
  )
  await act(async () => {
    finishCopy()
  })
  await expect(request).rejects.toThrow('no_longer_visible')
})

it('invalidates owned inventory and the pending revoke when the profile changes', async () => {
  useAppStore.setState({
    orcaProfileAuthStatus: {
      activeProfileId: 'profile-a',
      configured: true,
      state: 'connected',
      persistence: 'memory-only'
    }
  })
  let finishRevoke: () => void = () => undefined
  const revokeShare = vi.fn(
    () =>
      new Promise<{ status: 'ok'; value: undefined }>((resolve) => {
        finishRevoke = () => resolve({ status: 'ok', value: undefined })
      })
  )
  const listOwnedShares = vi
    .fn()
    .mockResolvedValueOnce({ status: 'ok', value: [share] })
    .mockResolvedValue({ status: 'ok', value: [] })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { skills: { listOwnedShares, revokeShare } }
  })
  function Viewer() {
    const shares = useOwnedSkillShares()
    return (
      <TooltipProvider>
        <SkillSharedLinksView query="" shares={shares} />
      </TooltipProvider>
    )
  }
  await act(async () => {
    render(<Viewer />)
  })
  await apply({ kind: 'confirm', id: share.id, value: 'revoke' })
  let request: ReturnType<typeof applySkillLinksViewerAction> | undefined
  await act(async () => {
    request = applySkillLinksViewerAction({ kind: 'execute', id: share.id, operation: 'revoke' })
    void request.catch(() => undefined)
  })
  await act(async () => {
    useAppStore.setState({
      orcaProfileAuthStatus: {
        activeProfileId: 'profile-b',
        configured: true,
        state: 'connected',
        persistence: 'memory-only'
      }
    })
  })
  await act(async () => {
    finishRevoke()
  })
  expect(listOwnedShares).toHaveBeenCalledTimes(2)
  await expect(request).rejects.toThrow('skill_link_operation_failed')
  await expect(applySkillLinksViewerAction({ kind: 'get' })).resolves.toMatchObject({
    visibleShareIds: [],
    busyShareId: null
  })
})

it('does not expose the previous account inventory when the new account lookup fails', async () => {
  useAppStore.setState({
    orcaProfileAuthStatus: {
      activeProfileId: 'profile-a',
      configured: true,
      state: 'connected',
      persistence: 'memory-only'
    }
  })
  const listOwnedShares = vi
    .fn()
    .mockResolvedValueOnce({ status: 'ok', value: [share] })
    .mockResolvedValue({ status: 'reconnect-required' })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { skills: { listOwnedShares } }
  })
  function Viewer() {
    const shares = useOwnedSkillShares()
    return (
      <TooltipProvider>
        <SkillSharedLinksView query="" shares={shares} />
      </TooltipProvider>
    )
  }
  await act(async () => {
    render(<Viewer />)
  })
  await act(async () => {
    useAppStore.setState({
      orcaProfileAuthStatus: {
        activeProfileId: 'profile-b',
        configured: true,
        state: 'reconnect-required',
        persistence: 'none'
      }
    })
  })
  await expect(applySkillLinksViewerAction({ kind: 'get' })).resolves.toMatchObject({
    visibleShareIds: [],
    rows: [],
    loading: false,
    error: expect.any(String)
  })
})

it('rejects a completed delete acknowledgement after the owner changes', async () => {
  useAppStore.setState({
    orcaProfileAuthStatus: {
      activeProfileId: 'profile-a',
      configured: true,
      state: 'connected',
      persistence: 'memory-only'
    }
  })
  let finishDelete: () => void = () => undefined
  const deletePackage = vi.fn(
    () =>
      new Promise<{ status: 'ok'; value: undefined }>((resolve) => {
        finishDelete = () => resolve({ status: 'ok', value: undefined })
      })
  )
  const listOwnedShares = vi
    .fn()
    .mockResolvedValueOnce({ status: 'ok', value: [share] })
    .mockResolvedValue({ status: 'ok', value: [] })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { skills: { listOwnedShares, deletePackage } }
  })
  function Viewer() {
    const shares = useOwnedSkillShares()
    return (
      <TooltipProvider>
        <SkillSharedLinksView query="" shares={shares} />
      </TooltipProvider>
    )
  }
  await act(async () => {
    render(<Viewer />)
  })
  await apply({ kind: 'confirm', id: share.id, value: 'delete' })
  let request: ReturnType<typeof applySkillLinksViewerAction> | undefined
  await act(async () => {
    request = applySkillLinksViewerAction({ kind: 'execute', id: share.id, operation: 'delete' })
    void request.catch(() => undefined)
  })
  await act(async () => {
    useAppStore.setState({
      orcaProfileAuthStatus: {
        activeProfileId: 'profile-b',
        configured: true,
        state: 'connected',
        persistence: 'memory-only'
      }
    })
  })
  await act(async () => {
    finishDelete()
  })
  await expect(request).rejects.toThrow('viewer_owner_changed')
  expect(listOwnedShares).toHaveBeenCalledTimes(2)
})
