import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RemoteDownloadController } from './remote-download-controller'
import * as promotion from './local-downloaded-folder-promotion'
let directory: string, destination: string, controller: RemoteDownloadController
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-folder-download-'))
  destination = join(directory, 'saved')
  controller = new RemoteDownloadController('remote_folder_download_busy')
})
afterEach(async () => {
  await controller.dispose()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})
async function settled(id: string) {
  await vi.waitFor(() =>
    expect(controller.status(id).state).not.toMatch(
      /pending|downloading|promoting|cancel_requested/
    )
  )
  return controller.status(id)
}
it('publishes actual nested bytes using original no-clobber promotion and preserves completed destination on cancellation', async () => {
  const request = controller.start(
    async () => destination,
    async (temp, signal) => {
      signal.throwIfAborted()
      await mkdir(join(temp, 'nested'))
      await writeFile(join(temp, 'nested', 'file.bin'), Buffer.from([0, 1, 255]))
    }
  )
  expect(await settled(request.requestId)).toMatchObject({
    state: 'completed',
    cleanupPending: false
  })
  expect(await readFile(join(destination, 'nested', 'file.bin'))).toEqual(Buffer.from([0, 1, 255]))
  expect((await controller.cancel(request.requestId)).state).toBe('completed')
  expect(await readdir(directory)).toEqual(['saved'])
})
it('does not overwrite an existing directory or admit a second active transfer', async () => {
  let finish: (() => void) | undefined
  const request = controller.start(
    async () => destination,
    async () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  await vi.waitFor(() => expect(finish).toBeDefined())
  expect(() =>
    controller.start(
      async () => destination,
      async () => {}
    )
  ).toThrow('remote_folder_download_busy')
  const cancel = controller.cancel(request.requestId)
  expect(controller.status(request.requestId).state).toBe('cancel_requested')
  finish?.()
  expect(await cancel).toMatchObject({ state: 'cancelled', cleanupPending: false })
  await mkdir(destination)
  await writeFile(join(destination, 'sentinel'), 'before')
  const next = controller.start(
    async () => destination,
    async () => {
      throw new Error('must not start')
    }
  )
  expect(await settled(next.requestId)).toMatchObject({ state: 'failed', cleanupPending: false })
  expect(await readFile(join(destination, 'sentinel'), 'utf8')).toBe('before')
})
it('waits for a non-cooperative provider before cancellation cleanup', async () => {
  let finish: (() => void) | undefined
  let signal: AbortSignal | undefined
  let staging: string | undefined
  const request = controller.start(
    async () => destination,
    async (temp, value) => {
      staging = temp
      signal = value
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      await writeFile(join(temp, 'late'), 'late provider write')
    }
  )
  await vi.waitFor(() => expect(finish).toBeDefined())
  const cancel = controller.cancel(request.requestId)
  expect(signal?.aborted).toBe(true)
  expect(controller.status(request.requestId).state).toBe('cancel_requested')
  expect(await readdir(staging!)).toEqual([])
  finish?.()
  expect(await cancel).toMatchObject({ state: 'cancelled', cleanupPending: false })
  expect(await readdir(directory)).toEqual([])
})
it('retains an identity-mismatched staging tree and refuses to delete foreign contents', async () => {
  let tempPath = ''
  let moved = ''
  const request = controller.start(
    async () => destination,
    async (temp) => {
      tempPath = temp
      moved = `${temp}-owned`
      await rename(temp, moved)
      await mkdir(temp, { mode: 0o700 })
      await writeFile(join(temp, 'foreign'), 'keep')
      throw new Error('private provider error')
    }
  )
  expect(await settled(request.requestId)).toMatchObject({ state: 'failed', cleanupPending: true })
  expect(JSON.stringify(controller.status(request.requestId))).not.toContain(
    'private provider error'
  )
  expect(await controller.cancel(request.requestId)).toMatchObject({ cleanupPending: true })
  expect(await readFile(join(tempPath, 'foreign'), 'utf8')).toBe('keep')
  expect(() =>
    controller.start(
      async () => destination,
      async () => {}
    )
  ).toThrow('remote_folder_download_busy')
  await rm(tempPath, { recursive: true })
  await rename(moved, tempPath)
  expect(await controller.cancel(request.requestId)).toMatchObject({
    state: 'cancelled',
    cleanupPending: false
  })
})
it('preserves a committed directory if cancellation arrives just after original promotion', async () => {
  const promote = promotion.promoteLocalDownloadedFolder
  let requestId = ''
  vi.spyOn(promotion, 'promoteLocalDownloadedFolder').mockImplementation(async (...args) => {
    await promote(...args)
    void controller.cancel(requestId)
  })
  const request = controller.start(
    async () => destination,
    async (temp) => {
      await writeFile(join(temp, 'file'), 'committed')
    }
  )
  requestId = request.requestId
  expect(await settled(request.requestId)).toMatchObject({
    state: 'completed',
    cleanupPending: false
  })
  expect(await readFile(join(destination, 'file'), 'utf8')).toBe('committed')
})
it('keeps the request owned until cancellation acknowledgement settles', async () => {
  const request = controller.start(
    async () => destination,
    async () => {}
  )
  await settled(request.requestId)
  const cancellation = controller.cancel(request.requestId)
  expect(() =>
    controller.start(
      async () => join(directory, 'next'),
      async () => {}
    )
  ).toThrow('remote_folder_download_busy')
  expect(await cancellation).toMatchObject({ state: 'completed' })
})
it('rejects a symbolic destination without changing its target', async () => {
  const { symlink } = await import('node:fs/promises')
  const original = join(directory, 'original')
  await mkdir(original)
  await writeFile(join(original, 'sentinel'), 'keep')
  await symlink(original, destination, 'dir')
  const download = vi.fn(async () => {})
  const request = controller.start(async () => destination, download)
  expect(await settled(request.requestId)).toMatchObject({ state: 'failed', cleanupPending: false })
  expect(download).not.toHaveBeenCalled()
  expect(await readFile(join(original, 'sentinel'), 'utf8')).toBe('keep')
})
it('keeps a polled request alive past fifteen minutes and cancels an unpolled one', async () => {
  let signal: AbortSignal | undefined
  let release: (() => void) | undefined
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const request = controller.start(
    async () => destination,
    async (_temp, value) => {
      signal = value
      await new Promise<void>((resolve) => {
        release = resolve
      })
    }
  )
  try {
    await vi.waitFor(() => expect(signal).toBeDefined())
    for (let minute = 0; minute < 30; minute += 10) {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
      controller.status(request.requestId)
    }
    expect(signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(16 * 60 * 1000)
    expect(signal?.aborted).toBe(true)
  } finally {
    release?.()
    vi.useRealTimers()
  }
  expect(await settled(request.requestId)).toMatchObject({ state: 'cancelled' })
})
it('returns cancel_requested when the provider cannot settle within the bounded wait', async () => {
  let finish: (() => void) | undefined
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const request = controller.start(
    async () => destination,
    async (temp) => {
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      await writeFile(join(temp, 'late'), 'late provider write')
    }
  )
  try {
    await vi.waitFor(() => expect(finish).toBeDefined())
    const cancel = controller.cancel(request.requestId)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(await cancel).toMatchObject({ state: 'cancel_requested' })
    expect(() =>
      controller.start(
        async () => join(directory, 'next'),
        async () => {}
      )
    ).toThrow('remote_folder_download_busy')
  } finally {
    finish?.()
    vi.useRealTimers()
  }
  expect(await settled(request.requestId)).toMatchObject({
    state: 'cancelled',
    cleanupPending: false
  })
  expect(await readdir(directory)).toEqual([])
})
it('uses the injected staging and busy code for single-file transfers', async () => {
  const fileController = new RemoteDownloadController('remote_file_download_busy')
  const target = join(directory, 'file.bin')
  const reserved = join(directory, '.reserved.download')
  let release: (() => void) | undefined
  const request = fileController.start(
    async () => target,
    async (temp) => {
      expect(temp).toBe(reserved)
      await new Promise<void>((resolve) => {
        release = resolve
      })
      await writeFile(temp, 'bytes')
    },
    () => ({
      create: async () => reserved,
      promote: () => rename(reserved, target),
      cleanup: async () => true
    })
  )
  await vi.waitFor(() => expect(release).toBeDefined())
  expect(() =>
    fileController.start(
      async () => target,
      async () => {}
    )
  ).toThrow('remote_file_download_busy')
  release?.()
  await vi.waitFor(() => expect(fileController.status(request.requestId).state).toBe('completed'))
  expect(await readFile(target, 'utf8')).toBe('bytes')
  await fileController.dispose()
})
