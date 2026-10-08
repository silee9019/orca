import { mkdtemp, rm, readFile, writeFile, readdir, rename, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NativeDownloadStagingFile } from './native-download-staging-file'
import * as promotion from './ipc/filesystem/filesystem-download-promotion'
let directory: string, path: string, file: NativeDownloadStagingFile
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-download-stage-'))
  path = join(directory, 'destination')
  file = new NativeDownloadStagingFile(path)
})
afterEach(async () => {
  vi.restoreAllMocks()
  await file.cleanup()
  await rm(directory, { recursive: true, force: true })
})
it('never removes a replacement temp inode or follows its symbolic link', async () => {
  await file.create(false)
  await file.append(Buffer.from('own'))
  const [temp] = await readdir(directory)
  await rename(join(directory, temp), join(directory, 'own-retired'))
  await writeFile(join(directory, temp), 'foreign sentinel')
  expect(await file.cleanup()).toBe(false)
  expect(await readFile(join(directory, temp), 'utf8')).toBe('foreign sentinel')
  await rm(join(directory, temp))
  await symlink(join(directory, 'own-retired'), join(directory, temp))
  expect(await file.cleanup()).toBe(false)
  expect(await readFile(join(directory, 'own-retired'), 'utf8')).toBe('own')
})
it('rejects a replaced overwrite destination and cleans its own staged bytes', async () => {
  await writeFile(path, 'old')
  await file.create(true)
  await file.append(Buffer.from('download'))
  await rename(path, join(directory, 'retired'))
  await writeFile(path, 'new sentinel')
  await expect(file.promote(new AbortController().signal)).rejects.toThrow(
    'Selected destination changed.'
  )
  expect(await file.cleanup()).toBe(true)
  expect(await readFile(path, 'utf8')).toBe('new sentinel')
  expect((await readdir(directory)).sort()).toEqual(['destination', 'retired'])
})
it('preserves the destination and repeatable cleanup when the original promotion rejects', async () => {
  await writeFile(path, 'sentinel')
  await file.create(true)
  await file.append(Buffer.from('download'))
  vi.spyOn(promotion, 'promoteDownloadedFile').mockRejectedValueOnce(
    new Error('private promotion error')
  )
  await expect(file.promote(new AbortController().signal)).rejects.toThrow()
  expect(await file.cleanup()).toBe(true)
  expect(await file.cleanup()).toBe(true)
  expect(await readFile(path, 'utf8')).toBe('sentinel')
})
