// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { MobileDriverOverlay } from './MobileDriverOverlay'
import {
  setDriverForPty,
  hydrateDrivers,
  getAllDrivers
} from '@/lib/pane-manager/mobile-driver-state'
import {
  setFitOverride,
  hydrateOverrides,
  getMobileFitOverridePtyIds
} from '@/lib/pane-manager/mobile-fit-overrides'
import { applyMobileDriverViewerRequest } from '@/runtime/mobile-driver-viewer'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'
const restore = vi.fn<() => Promise<boolean>>()
const restoreAll = vi.fn<() => Promise<boolean>>()
const driver = { kind: 'mobile', clientId: 'private-phone-canary' } as const
function surface() {
  return (
    <TooltipProvider>
      <MobileDriverOverlay
        ptyId="pty-a"
        driver={driver}
        hasFitOverride
        onAction={restore}
        onAllAction={restoreAll}
      />
    </TooltipProvider>
  )
}
function clear(ptyId = 'pty-a') {
  setDriverForPty(ptyId, { kind: 'idle' })
  setFitOverride(ptyId, 'desktop-fit', 80, 24)
}
async function invoke(command: ConnectionsViewerCommand) {
  let pending: ReturnType<typeof applyMobileDriverViewerRequest> | undefined
  await act(async () => {
    pending = applyMobileDriverViewerRequest({
      id: 'driver-fixture',
      expiresAt: Date.now() + 1000,
      command
    })
    void pending.catch(() => {})
  })
  if (!pending) {
    throw new Error('missing_request')
  }
  return pending
}
beforeEach(() => {
  vi.clearAllMocks()
  hydrateDrivers([])
  hydrateOverrides([])
  setDriverForPty('pty-a', driver)
  setFitOverride('pty-a', 'mobile-fit', 40, 20)
  restore.mockImplementation(async () => {
    clear()
    return true
  })
  restoreAll.mockImplementation(async () => {
    clear()
    clear('pty-b')
    return true
  })
})
afterEach(() => {
  cleanup()
  hydrateDrivers([])
  hydrateOverrides([])
})
it('pairs native minimize/expand with the same viewer-local typed collapse owner', async () => {
  render(surface())
  fireEvent.click(screen.getByRole('button', { name: 'Minimize' }))
  expect(
    await invoke({ viewerId: 7, operation: 'mobile-driver.get', ptyId: 'pty-a' })
  ).toMatchObject({ state: { collapsed: true } })
  expect(
    await invoke({ viewerId: 7, operation: 'mobile-driver.expand', ptyId: 'pty-a' })
  ).toMatchObject({ applied: true, state: { collapsed: false } })
  expect(
    await invoke({ viewerId: 7, operation: 'mobile-driver.collapse', ptyId: 'pty-a' })
  ).toMatchObject({ applied: true, state: { collapsed: true } })
  fireEvent.click(screen.getByRole('button', { name: 'Phone driving' }))
  expect(
    await invoke({ viewerId: 7, operation: 'mobile-driver.get', ptyId: 'pty-a' })
  ).toMatchObject({ state: { collapsed: false } })
  expect(restore).not.toHaveBeenCalled()
  expect(restoreAll).not.toHaveBeenCalled()
})
it('requires exact PTY confirmation and observes canonical driver/fit clearance', async () => {
  render(surface())
  await expect(
    invoke({
      viewerId: 7,
      operation: 'mobile-driver.restore',
      ptyId: 'pty-a',
      confirmTarget: 'pty-b'
    })
  ).rejects.toThrow('confirm_target_mismatch')
  expect(restore).not.toHaveBeenCalled()
  const result = await invoke({
    viewerId: 7,
    operation: 'mobile-driver.restore',
    ptyId: 'pty-a',
    confirmTarget: 'pty-a'
  })
  expect(result).toMatchObject({
    applied: true,
    persisted: null,
    state: { driving: false, heldFit: false, remainingCount: 0 }
  })
  expect(JSON.stringify(result)).not.toContain('private-phone-canary')
  expect(restore).toHaveBeenCalledOnce()
})
it('shares a synchronous native and typed guard and reports restore failure without private errors', async () => {
  let finish: ((value: boolean) => void) | undefined
  restore.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  render(surface())
  fireEvent.click(screen.getByRole('button', { name: /^Take back$/ }))
  expect(
    await invoke({
      viewerId: 7,
      operation: 'mobile-driver.restore',
      ptyId: 'pty-a',
      confirmTarget: 'pty-a'
    })
  ).toMatchObject({ applied: false })
  expect(restore).toHaveBeenCalledOnce()
  await act(async () => {
    finish?.(false)
  })
  restore.mockRejectedValueOnce(new Error('private-restore-error-canary'))
  const result = await invoke({
    viewerId: 7,
    operation: 'mobile-driver.restore',
    ptyId: 'pty-a',
    confirmTarget: 'pty-a'
  })
  expect(result.applied).toBe(false)
  expect(JSON.stringify(result)).not.toContain('private-restore-error-canary')
})
it('rejects actor replacement and duplicate PTY surfaces before invoking an owner', async () => {
  const view = render(surface())
  setDriverForPty('pty-a', { kind: 'mobile', clientId: 'replacement-phone' })
  await expect(
    invoke({
      viewerId: 7,
      operation: 'mobile-driver.restore',
      ptyId: 'pty-a',
      confirmTarget: 'pty-a'
    })
  ).rejects.toThrow('connections_surface_unavailable')
  expect(restore).not.toHaveBeenCalled()
  setDriverForPty('pty-a', driver)
  view.rerender(
    <>
      {surface()}
      {surface()}
    </>
  )
  await expect(
    invoke({
      viewerId: 7,
      operation: 'mobile-driver.restore',
      ptyId: 'pty-a',
      confirmTarget: 'pty-a'
    })
  ).rejects.toThrow('connections_viewer_ambiguous')
  expect(restore).not.toHaveBeenCalled()
})
it('restores the existing all-terminal owner only with explicit all confirmation', async () => {
  setDriverForPty('pty-b', { kind: 'mobile', clientId: 'second-phone' })
  render(surface())
  await expect(
    invoke({
      viewerId: 7,
      operation: 'mobile-driver.restore-all',
      ptyId: 'pty-a',
      confirmTarget: 'pty-a'
    })
  ).rejects.toThrow('confirm_target_mismatch')
  expect(restoreAll).not.toHaveBeenCalled()
  expect(
    await invoke({
      viewerId: 7,
      operation: 'mobile-driver.restore-all',
      ptyId: 'pty-a',
      confirmTarget: 'all-mobile-terminals'
    })
  ).toMatchObject({ applied: true, state: { remainingCount: 0 } })
  expect(restoreAll).toHaveBeenCalledOnce()
})

it('reuses the native chip action and native all-action callbacks with canonical readback', async () => {
  const view = render(surface())
  await invoke({ viewerId: 7, operation: 'mobile-driver.collapse', ptyId: 'pty-a' })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^Take back$/ }))
  })
  expect(restore).toHaveBeenCalledOnce()
  view.unmount()
  setDriverForPty('pty-a', driver)
  setFitOverride('pty-a', 'mobile-fit', 40, 20)
  setDriverForPty('pty-b', { kind: 'mobile', clientId: 'second-phone' })
  render(surface())
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Take back all' }))
  })
  expect(restoreAll).toHaveBeenCalledOnce()
  expect(getAllDrivers().size).toBe(0)
  expect(getMobileFitOverridePtyIds()).toEqual([])
})

it('root ignores stale native minimize when the canonical phone actor changes before rendering', async () => {
  render(surface())
  setDriverForPty('pty-a', { kind: 'mobile', clientId: 'replacement-phone' })
  fireEvent.click(screen.getByRole('button', { name: 'Minimize' }))
  expect(screen.getByRole('button', { name: 'Minimize' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Phone driving' })).toBeNull()
})
it('root ignores stale native expand when the canonical phone actor changes before rendering', async () => {
  render(surface())
  await invoke({ viewerId: 7, operation: 'mobile-driver.collapse', ptyId: 'pty-a' })
  setDriverForPty('pty-a', { kind: 'mobile', clientId: 'replacement-phone' })
  fireEvent.click(screen.getByRole('button', { name: 'Phone driving' }))
  expect(screen.getByRole('button', { name: 'Phone driving' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Minimize' })).toBeNull()
})
