// @vitest-environment happy-dom
import { useEffect } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ConfirmationDialogProvider } from '@/components/confirmation-dialog'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import {
  applyArtifactDeleteConfirmation,
  bindArtifactDeleteConfirmation
} from '@/runtime/artifact-delete-viewer-controller'
const blocking = vi.hoisted(() => vi.fn())
vi.mock('@/store', () => ({ useAppStore: () => blocking }))
afterEach(cleanup)
it('aborts only its own confirmation and preserves unrelated queued requests', async () => {
  const firstPreference = vi.fn()
  const secondPreference = vi.fn()
  const abort = new AbortController()
  const cancelled = new AbortController()
  cancelled.abort()
  const reviewedTarget = '00000000-0000-4000-8000-000000000001'
  let first: Promise<boolean> | undefined
  let second: Promise<boolean> | undefined
  let third: Promise<boolean> | undefined
  function Requests() {
    const confirm = useConfirmationDialog()
    useEffect(() => {
      first = confirm({
        title: 'Artifact deletion',
        dontAskAgain: { onConfirmed: firstPreference },
        signal: abort.signal,
        onViewerControl: bindArtifactDeleteConfirmation({ slug: 'fixture', reviewedTarget })
      })
      second = confirm({
        title: 'Unrelated confirmation',
        dontAskAgain: { onConfirmed: secondPreference }
      })
      third = confirm({ title: 'Already cancelled', signal: cancelled.signal })
    }, [confirm])
    return null
  }
  await act(async () => {
    render(
      <ConfirmationDialogProvider>
        <Requests />
      </ConfirmationDialogProvider>
    )
  })
  await screen.findByRole('dialog', { name: 'Artifact deletion' })
  await expect(third).resolves.toBe(false)
  await act(async () => fireEvent.click(screen.getByRole('checkbox')))
  expect(screen.getByRole('checkbox').getAttribute('data-state')).toBe('checked')
  await act(async () => abort.abort())
  await expect(first).resolves.toBe(false)
  await screen.findByRole('dialog', { name: 'Unrelated confirmation' })
  expect(firstPreference).not.toHaveBeenCalled()
  expect(screen.getByRole('checkbox').getAttribute('data-state')).toBe('unchecked')
  await expect(
    applyArtifactDeleteConfirmation({
      kind: 'delete-confirmation',
      slug: 'fixture',
      reviewedTarget,
      confirmed: true
    })
  ).rejects.toThrow('viewer_unavailable')
  expect(screen.getByRole('dialog', { name: 'Unrelated confirmation' })).toBeTruthy()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Confirm' })))
  await expect(second).resolves.toBe(true)
  expect(secondPreference).not.toHaveBeenCalled()
})
