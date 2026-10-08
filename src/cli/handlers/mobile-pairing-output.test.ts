import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RuntimeClient } from '../runtime-client'
import { MOBILE_CONNECTION_HANDLERS } from './mobile-connections'
import { restrictWindowsPathSync } from '../../shared/secure-path-windows-acl'

vi.mock('../../shared/secure-path-windows-acl', () => ({
  restrictWindowsPathSync: vi.fn()
}))

const directories: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  vi.mocked(restrictWindowsPathSync).mockReset()
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function fixture(command: string) {
  const cwd = await mkdtemp(join(tmpdir(), 'orca-pairing-acl-'))
  directories.push(cwd)
  const output = join(cwd, 'pairing.json')
  const client = new RuntimeClient(cwd, 1000, null, null)
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    result: { pairingUrl: 'private-pairing-canary' },
    _meta: { runtimeId: 'fixture-runtime' }
  })
  const stdout = vi.spyOn(console, 'log').mockImplementation(() => {})
  const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
  const flags = new Map<string, string | boolean>([['output-file', output]])
  flags.set(
    command === 'mobile pairing create' ? 'mode' : 'reach',
    command === 'mobile pairing create' ? 'local-only' : 'this-computer'
  )
  return { output, call, stdout, stderr, ctx: { cwd, client, flags, json: true } }
}

describe.each(['mobile pairing create', 'mobile runtime-pairing create'])(
  '%s private output',
  (command) => {
    it('fails closed before minting and deletes only its new empty file when Windows ACL verification fails', async () => {
      const f = await fixture(command)
      vi.mocked(restrictWindowsPathSync).mockReturnValue(false)
      await expect(MOBILE_CONNECTION_HANDLERS[command](f.ctx)).rejects.toMatchObject({
        code: 'private_output_unprotected'
      })
      expect(restrictWindowsPathSync).toHaveBeenCalledWith(f.output, false)
      expect(f.call).not.toHaveBeenCalled()
      await expect(stat(f.output)).rejects.toMatchObject({ code: 'ENOENT' })
      expect(f.stdout.mock.calls.flat().join('')).not.toContain('private-pairing-canary')
      expect(f.stderr.mock.calls.flat().join('')).not.toContain('private-pairing-canary')
    })
    it('verifies Windows ACL before minting and keeps the secret out of console output', async () => {
      const f = await fixture(command)
      vi.mocked(restrictWindowsPathSync).mockReturnValue(true)
      f.call.mockImplementation(async () => {
        expect(restrictWindowsPathSync).toHaveBeenCalledWith(f.output, false)
        expect((await stat(f.output)).size).toBe(0)
        return {
          id: 'fixture',
          ok: true,
          result: { pairingUrl: 'private-pairing-canary' },
          _meta: { runtimeId: 'fixture-runtime' }
        }
      })
      await MOBILE_CONNECTION_HANDLERS[command](f.ctx)
      expect(await readFile(f.output, 'utf8')).toContain('private-pairing-canary')
      expect(f.stdout.mock.calls.flat().join('')).not.toContain('private-pairing-canary')
      expect(f.stderr.mock.calls.flat().join('')).not.toContain('private-pairing-canary')
    })
    it('preserves an existing file without hardening or minting', async () => {
      const f = await fixture(command)
      await writeFile(f.output, 'existing-owner-content')
      await expect(MOBILE_CONNECTION_HANDLERS[command](f.ctx)).rejects.toMatchObject({
        code: 'EEXIST'
      })
      expect(await readFile(f.output, 'utf8')).toBe('existing-owner-content')
      expect(restrictWindowsPathSync).not.toHaveBeenCalled()
      expect(f.call).not.toHaveBeenCalled()
    })
  }
)
