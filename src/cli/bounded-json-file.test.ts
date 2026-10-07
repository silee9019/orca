import { expect, it } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readBoundedCliJsonFile } from './bounded-json-file'
it('bounds regular JSON files before parsing and rejects directories', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'orca-json-fixture-'))
  const file = join(dir, 'input.json')
  try {
    await writeFile(file, '{"ok":true}')
    expect(await readBoundedCliJsonFile(file, 1024)).toEqual({ ok: true })
    await writeFile(file, ' '.repeat(1025))
    await expect(readBoundedCliJsonFile(file, 1024)).rejects.toThrow('bounded regular file')
    await expect(readBoundedCliJsonFile(dir, 1024)).rejects.toThrow('bounded regular file')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
