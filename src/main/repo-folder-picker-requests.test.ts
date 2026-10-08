import { afterEach, expect, it, vi } from 'vitest'
import { RepoPickerRequests } from './repo-picker-requests'
import type { RepoPickerSelection } from '../shared/repo-picker-types'
let picker: RepoPickerRequests | undefined
afterEach(() => {
  picker?.dispose()
  vi.restoreAllMocks()
})
it('keeps a folder selection private until completion and cancellation discards a late multi-selection', async () => {
  let finish: ((result: RepoPickerSelection | null) => void) | undefined
  picker = new RepoPickerRequests(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const owner = picker
  const started = owner.start('folders')
  await vi.waitFor(() => expect(finish).toBeDefined())
  expect(owner.status(started.requestId, 'folders')).not.toHaveProperty('paths')
  expect(() => owner.cancel(started.requestId, 'icon')).toThrow('selector_not_found')
  expect(owner.cancel(started.requestId, 'folders').state).toBe('cancel_requested')
  expect(() => owner.start('icon')).toThrow(/already pending/)
  finish?.({ kind: 'folders', paths: ['/private-canary'] })
  await vi.waitFor(() => expect(owner.status(started.requestId, 'folders').state).toBe('cancelled'))
  expect(() => owner.folderResult(started.requestId)).toThrow(/completed/)
  expect(JSON.stringify(owner.status(started.requestId, 'folders'))).not.toContain('private-canary')
})
it('returns only the chosen folder result and rejects oversized retained selections', async () => {
  const select = vi.fn().mockResolvedValue({ kind: 'directory', paths: ['/selected'] })
  picker = new RepoPickerRequests(select)
  const owner = picker
  const started = owner.start('directory')
  await vi.waitFor(() => expect(owner.status(started.requestId).state).toBe('completed'))
  expect(owner.folderResult(started.requestId)).toEqual({ kind: 'directory', paths: ['/selected'] })
  expect(() => owner.result(started.requestId)).toThrow('selector_not_found')
  select.mockResolvedValueOnce({
    kind: 'folders',
    paths: Array.from({ length: 501 }, () => '/selected')
  })
  const large = owner.start('folders')
  await vi.waitFor(() => expect(owner.status(large.requestId).state).toBe('failed'))
  expect(() => owner.folderResult(large.requestId)).toThrow(/completed/)
})
