import { mkdtemp, rm, writeFile, appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FSWatcher } from 'node:fs'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as watcherFactory from './local-log-file-watcher'
import { DesktopLogTailController } from './desktop-log-tail-controller'
let directory: string
let path: string
let controller: DesktopLogTailController
const watches: FSWatcher[] = []
const closed = new WeakSet<FSWatcher>()
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-owned-tail-'))
  path = join(directory, 'fixture.log')
  await writeFile(path, 'initial')
  controller = new DesktopLogTailController()
  const original = watcherFactory.watchLocalLogFile
  vi.spyOn(watcherFactory, 'watchLocalLogFile').mockImplementation((...args) => {
    const watcher = original(...args)
    watches.push(watcher)
    watcher.once('close', () => closed.add(watcher))
    return watcher
  })
})
afterEach(async () => {
  controller.dispose()
  await Promise.all(
    watches.splice(0).map(async (watcher) => {
      if (!closed.has(watcher)) {
        await new Promise<void>((resolve) => {
          watcher.once('close', () => resolve())
          watcher.close()
        })
      }
    })
  )
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})
it('retains the slot through pending cancellation and never installs a late watcher', async () => {
  let release: ((path: string) => void) | undefined
  const request = controller.start(
    async () =>
      new Promise((resolve) => {
        release = resolve
      })
  )
  await vi.waitFor(() => expect(release).toBeDefined())
  expect(controller.stop(request.requestId).state).toBe('stop_requested')
  expect(() => controller.start(async () => path)).toThrow('desktop_log_tail_busy')
  release?.(path)
  await vi.waitFor(() => expect(controller.status(request.requestId).state).toBe('stopped'))
  expect(watcherFactory.watchLocalLogFile).not.toHaveBeenCalled()
  const next = controller.start(async () => path)
  await vi.waitFor(() => expect(controller.status(next.requestId).state).toBe('watching'))
  expect(() => controller.status(request.requestId)).toThrow('selector_not_found')
})
it('observes native changes and close and discards retired callbacks without touching the next watch', async () => {
  const request = controller.start(async () => path)
  await vi.waitFor(() => expect(controller.status(request.requestId).state).toBe('watching'))
  await appendFile(path, 'appended')
  await vi.waitFor(() => expect(controller.status(request.requestId).sequence).toBeGreaterThan(0))
  const previous = watches[0]
  controller.stop(request.requestId)
  await vi.waitFor(() =>
    expect(controller.status(request.requestId)).toMatchObject({
      state: 'stopped',
      watcherClosed: true
    })
  )
  const next = controller.start(async () => path)
  await vi.waitFor(() => expect(controller.status(next.requestId).state).toBe('watching'))
  previous.emit('change', 'rename', 'fixture.log')
  previous.emit('error', new Error('private retired error'))
  expect(controller.status(next.requestId)).toMatchObject({
    state: 'watching',
    sequence: 0,
    watcherClosed: false
  })
})
it('applies idle expiration even before its timer runs and removes settled metadata', async () => {
  const request = controller.start(async () => path)
  await vi.waitFor(() => expect(controller.status(request.requestId).state).toBe('watching'))
  const now = Date.now()
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 15 * 60 * 1000 + 1)
  expect(controller.status(request.requestId).state).toBe('stop_requested')
  await vi.waitFor(() => expect(controller.status(request.requestId).watcherClosed).toBe(true))
  clock.mockReturnValue(now + 30 * 60 * 1000 + 2)
  expect(() => controller.status(request.requestId)).toThrow('selector_not_found')
})
it('does not claim closure after a close failure and permits an exact owned retry', async () => {
  const request = controller.start(async () => path)
  await vi.waitFor(() => expect(controller.status(request.requestId).state).toBe('watching'))
  vi.spyOn(watches[0], 'close').mockImplementationOnce(() => {
    throw new Error('private close diagnostic')
  })
  expect(controller.stop(request.requestId)).toMatchObject({
    state: 'failed',
    watcherClosed: false
  })
  expect(() => controller.start(async () => path)).toThrow('desktop_log_tail_busy')
  expect(() => controller.stop('foreign')).toThrow('selector_not_found')
  controller.stop(request.requestId)
  await vi.waitFor(() =>
    expect(controller.status(request.requestId)).toMatchObject({
      state: 'failed',
      watcherClosed: true
    })
  )
  expect(JSON.stringify(controller.status(request.requestId))).not.toContain(
    'private close diagnostic'
  )
})
it('turns the original watcher error into a final cursor and closes its exact native handle', async () => {
  const request = controller.start(async () => path)
  await vi.waitFor(() => expect(controller.status(request.requestId).state).toBe('watching'))
  watches[0].emit('error', new Error('private native diagnostic'))
  await vi.waitFor(() =>
    expect(controller.status(request.requestId)).toMatchObject({
      state: 'failed',
      sequence: 1,
      lastEventType: 'rename',
      watcherClosed: true
    })
  )
  expect(JSON.stringify(controller.status(request.requestId))).not.toContain('private native')
})
