import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs, specPaths, validateCommandAndFlags } from '../args'
import { ACCOUNT_MOUNTED_VIEWER_COMMAND_SPECS } from '../specs/account-mounted-viewer'
import { RuntimeClient } from '../runtime-client'
import { ACCOUNT_MOUNTED_VIEWER_HANDLERS } from './account-mounted-viewer'
import {
  AccountMountedViewerActionSchema,
  parseAccountMountedViewerAction
} from '../../shared/account-mounted-viewer-command'

afterEach(() => vi.restoreAllMocks())
it('bounds private file input, validates desktop before reading, and never prints drafts or remote errors', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'orca-mounted-private-'))
  const sentinel = 'private-fixture-sentinel'
  const file = join(directory, 'action.json')
  const client = new RuntimeClient('/fixture', 100, null, null, 'orca')
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    result: { secret: sentinel },
    _meta: { runtimeId: 'fixture' }
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  const flags = new Map([
    ['viewer', 'desktop'],
    ['input-file', file]
  ])
  const context = { client, cwd: directory, flags, json: true }
  const run = () => {
    const specs = ACCOUNT_MOUNTED_VIEWER_COMMAND_SPECS
    const parsed = parseArgs(
      [
        'account-view',
        'mounted',
        '--viewer',
        flags.get('viewer') ?? '',
        '--input-file',
        file,
        '--json'
      ],
      specs.flatMap(specPaths),
      specs
    )
    validateCommandAndFlags(specs, parsed)
    return ACCOUNT_MOUNTED_VIEWER_HANDLERS[parsed.commandPath.join(' ')]({
      ...context,
      flags: parsed.flags
    })
  }
  try {
    flags.set('viewer', 'remote')
    await expect(run()).rejects.toThrow('desktop')
    expect(call).not.toHaveBeenCalled()
    flags.set('viewer', 'desktop')
    writeFileSync(file, JSON.stringify({ type: 'account-opencode-go-draft', value: sentinel }), {
      mode: 0o600
    })
    await run()
    expect(call).toHaveBeenCalledWith('accounts.viewerAction', {
      viewer: 'desktop',
      action: { type: 'account-opencode-go-draft', value: sentinel }
    })
    expect(output.mock.calls.flat().join(' ')).not.toContain(sentinel)
    call.mockRejectedValueOnce(new Error(sentinel))
    await expect(run()).rejects.toThrow('mounted account action failed')
    call.mockClear()
    for (const value of [
      `{${sentinel}`,
      JSON.stringify({ type: 'account-bitbucket-draft', field: sentinel, value: sentinel }),
      JSON.stringify({ type: 'account-opencode-go-draft', value: sentinel, [sentinel]: true }),
      'x'.repeat(65537)
    ]) {
      writeFileSync(file, value)
      try {
        await run()
        throw new Error('Expected rejection')
      } catch (error) {
        expect(String(error)).not.toContain(sentinel)
      }
    }
    expect(call).not.toHaveBeenCalled()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

it('replaces raw Zod issues containing private property names with a fixed error', () => {
  const sentinel = 'private-fixture-property'
  const input = { type: 'account-opencode-go-draft', value: sentinel, [sentinel]: true }
  const raw = AccountMountedViewerActionSchema.safeParse(input)
  expect(raw.success).toBe(false)
  if (!raw.success) {
    expect(raw.error.message).toContain(sentinel)
  }
  try {
    parseAccountMountedViewerAction(input)
    throw new Error('Expected rejection')
  } catch (error) {
    expect(String(error)).not.toContain(sentinel)
    expect(String(error)).toContain('Invalid mounted account action')
  }
})
