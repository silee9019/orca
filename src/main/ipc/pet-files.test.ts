import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

const profile = vi.hoisted(() => ({ path: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => profile.path },
  BrowserWindow: {},
  dialog: {},
  ipcMain: {}
}))
import { deletePetFile, importPetImage, readPetFile } from './pet'

const ownedDirectories: string[] = []
afterEach(async () => {
  await Promise.all(
    ownedDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  )
})

it('imports exact bytes into an isolated profile and removes only the confirmed pet', async () => {
  profile.path = await mkdtemp(join(tmpdir(), 'orca-pet-fixture-'))
  ownedDirectories.push(profile.path)
  const source = join(profile.path, 'fixture.png')
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  await writeFile(source, bytes)
  const pet = await importPetImage(source)
  const stored = join(profile.path, 'sidekicks', 'custom', pet.fileName)
  expect(await readFile(stored)).toEqual(bytes)
  expect(Buffer.from((await readPetFile(pet.id, pet.fileName))!)).toEqual(bytes)
  expect(await readPetFile('../escape', pet.fileName)).toBeNull()
  await deletePetFile(pet.id, pet.fileName)
  await expect(readFile(stored)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(source)).toEqual(bytes)
})
