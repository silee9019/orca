import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DesktopDownloadSessionController } from './desktop-download-session-controller'
import * as stagingModule from './native-download-staging-file'
let directory: string, path: string, controller: DesktopDownloadSessionController
const content = (value: string) => Buffer.from(value).toString('base64')
async function wait(id: string, state: string) {
  await vi.waitFor(() => expect(controller.status(id).state).toBe(state))
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-download-session-'))
  path = join(directory, 'result.bin')
  controller = new DesktopDownloadSessionController()
})
afterEach(async () => {
  controller.dispose()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})
it('writes real bytes with offsets and promotes only after successful finish', async () => {
  const request = controller.start(async () => path, false)
  await wait(request.requestId, 'open')
  expect(await readdir(directory)).toHaveLength(1)
  await controller.append(request.requestId, 0, content('한글'))
  await expect(controller.append(request.requestId, 0, content('duplicate'))).rejects.toThrow(
    'download_byte_offset_mismatch'
  )
  await controller.append(request.requestId, Buffer.byteLength('한글'), content(' bytes'))
  expect(await controller.finish(request.requestId)).toMatchObject({
    state: 'finished',
    cleanupPending: false,
    byteOffset: Buffer.byteLength('한글 bytes')
  })
  expect(await readFile(path, 'utf8')).toBe('한글 bytes')
  expect(await readdir(directory)).toEqual(['result.bin'])
  expect((await controller.cancel(request.requestId)).state).toBe('finished')
  expect(await readFile(path, 'utf8')).toBe('한글 bytes')
})
it('rejects clobber by default and notices a destination created during an open session', async () => {
  await writeFile(path, 'sentinel')
  let request = controller.start(async () => path, false)
  await wait(request.requestId, 'failed')
  expect(controller.status(request.requestId).cleanupPending).toBe(false)
  expect(await readFile(path, 'utf8')).toBe('sentinel')
  request = controller.start(async () => join(directory, 'new.bin'), false)
  await wait(request.requestId, 'open')
  await controller.append(request.requestId, 0, content('download'))
  await writeFile(join(directory, 'new.bin'), 'new sentinel')
  expect(await controller.finish(request.requestId)).toMatchObject({
    state: 'failed',
    cleanupPending: false
  })
  expect(await readFile(join(directory, 'new.bin'), 'utf8')).toBe('new sentinel')
  expect((await readdir(directory)).sort()).toEqual(['new.bin', 'result.bin'])
})
it('allows explicit overwrite and removes only its private staging file on cancel', async () => {
  await writeFile(path, 'sentinel')
  let request = controller.start(async () => path, true)
  await wait(request.requestId, 'open')
  await controller.append(request.requestId, 0, content('replacement'))
  await controller.finish(request.requestId)
  expect(await readFile(path, 'utf8')).toBe('replacement')
  request = controller.start(async () => path, true)
  await wait(request.requestId, 'open')
  await controller.append(request.requestId, 0, content('never promoted'))
  await expect(controller.cancel('foreign')).rejects.toThrow('selector_not_found')
  expect(await controller.cancel(request.requestId)).toMatchObject({
    state: 'cancelled',
    cleanupPending: false
  })
  expect(await readFile(path, 'utf8')).toBe('replacement')
  expect(await readdir(directory)).toEqual(['result.bin'])
})
it('retains admission through pending cancellation and never creates late staging bytes', async () => {
  let finish: ((value: string) => void) | undefined
  const request = controller.start(
    async () =>
      new Promise((resolve) => {
        finish = resolve
      }),
    false
  )
  await vi.waitFor(() => expect(finish).toBeDefined())
  const cancelled = controller.cancel(request.requestId)
  expect(() => controller.start(async () => path, false)).toThrow('desktop_download_session_busy')
  finish?.(path)
  expect(await cancelled).toMatchObject({ state: 'cancelled', cleanupPending: false })
  expect(await readdir(directory)).toEqual([])
})
it('rejects concurrent writes and finish until its own in-flight append settles', async () => {
  const original = stagingModule.NativeDownloadStagingFile.prototype.append
  let release: (() => void) | undefined
  vi.spyOn(stagingModule.NativeDownloadStagingFile.prototype, 'append').mockImplementation(
    async function (this: stagingModule.NativeDownloadStagingFile, bytes) {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      await original.call(this, bytes)
    }
  )
  const request = controller.start(async () => path, false)
  await wait(request.requestId, 'open')
  const append = controller.append(request.requestId, 0, content('bytes'))
  await vi.waitFor(() => expect(release).toBeDefined())
  await expect(controller.append(request.requestId, 0, content('other'))).rejects.toThrow(
    'desktop_download_session_busy'
  )
  await expect(controller.finish(request.requestId)).rejects.toThrow(
    'desktop_download_session_busy'
  )
  const cancel = controller.cancel(request.requestId)
  release?.()
  await expect(append).rejects.toThrow('Owned download append did not complete.')
  expect(await cancel).toMatchObject({ state: 'cancelled', cleanupPending: false })
  expect(await readdir(directory)).toEqual([])
})
it('expires only its open staging file and forgets settled metadata later', async () => {
  const request = controller.start(async () => path, false)
  await wait(request.requestId, 'open')
  const now = Date.now()
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 15 * 60 * 1000 + 1)
  expect(controller.status(request.requestId).state).toBe('cancel_requested')
  await wait(request.requestId, 'cancelled')
  expect(await readdir(directory)).toEqual([])
  clock.mockReturnValue(now + 30 * 60 * 1000 + 2)
  expect(() => controller.status(request.requestId)).toThrow('selector_not_found')
})
it('keeps a failed cleanup retryable and blocks a new session while owned staging remains', async () => {
  const cleanup = vi
    .spyOn(stagingModule.NativeDownloadStagingFile.prototype, 'cleanup')
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(false)
  const request = controller.start(async () => path, false)
  await wait(request.requestId, 'open')
  expect(await controller.cancel(request.requestId)).toMatchObject({
    state: 'failed',
    cleanupPending: true
  })
  expect(() => controller.start(async () => path, false)).toThrow('desktop_download_session_busy')
  cleanup.mockRestore()
  expect(await controller.cancel(request.requestId)).toMatchObject({
    state: 'cancelled',
    cleanupPending: false
  })
  expect(await readdir(directory)).toEqual([])
})
it('reports a successful promotion when cancellation arrives after the original rename committed', async () => {
  const original = stagingModule.NativeDownloadStagingFile.prototype.promote
  let release: (() => void) | undefined
  vi.spyOn(stagingModule.NativeDownloadStagingFile.prototype, 'promote').mockImplementation(
    async function (this: stagingModule.NativeDownloadStagingFile, signal) {
      await original.call(this, signal)
      await new Promise<void>((resolve) => {
        release = resolve
      })
    }
  )
  const request = controller.start(async () => path, false)
  await wait(request.requestId, 'open')
  await controller.append(request.requestId, 0, content('committed bytes'))
  const finish = controller.finish(request.requestId)
  await vi.waitFor(() => expect(release).toBeDefined())
  const cancel = controller.cancel(request.requestId)
  release?.()
  expect(await finish).toMatchObject({ state: 'finished', cleanupPending: false })
  expect(await cancel).toMatchObject({ state: 'finished', cleanupPending: false })
  expect(await readFile(path, 'utf8')).toBe('committed bytes')
})
it('disposes an open owned file before allowing its controller to admit another session', async () => {
  const request = controller.start(async () => path, false)
  await wait(request.requestId, 'open')
  controller.dispose()
  await vi.waitFor(async () => expect(await readdir(directory)).toEqual([]))
  await vi.waitFor(() =>
    expect(() => controller.status(request.requestId)).toThrow('selector_not_found')
  )
  const next = controller.start(async () => path, false)
  await wait(next.requestId, 'open')
  await controller.cancel(next.requestId)
})
