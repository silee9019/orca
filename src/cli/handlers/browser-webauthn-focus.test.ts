import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RuntimeClient } from '../runtime-client'
import { parseArgs, validateCommandAndFlags } from '../args'
import { BROWSER_WEBAUTHN_FOCUS_COMMAND_SPECS } from '../specs/browser-webauthn-focus'
import { BROWSER_WEBAUTHN_FOCUS_HANDLERS } from './browser-webauthn-focus'
const client = new RuntimeClient(tmpdir())
let dir = ''
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'orca-focus-reader-'))
  await writeFile(join(dir, 'credential'), 'PRIVATE_CREDENTIAL', { mode: 0o600 })
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(dir, { recursive: true, force: true })
})
const state = {
  requestId: 'request',
  page: 'page',
  worktreeId: 'folder:fixture',
  environmentId: null,
  relyingPartyId: 'fixture.invalid',
  focused: true,
  accountIndex: 0
}
async function run(json = true) {
  const specs = BROWSER_WEBAUTHN_FOCUS_COMMAND_SPECS
  const parsed = parseArgs(
    [
      'browser',
      'webauthn',
      'dialog-focus',
      '--viewer',
      'host',
      '--request',
      'request',
      '--page',
      'page',
      '--worktree',
      'folder:fixture',
      '--relying-party',
      'fixture.invalid',
      '--credential-file',
      join(dir, 'credential')
    ],
    specs.map((spec) => spec.path),
    specs
  )
  validateCommandAndFlags(specs, parsed)
  await BROWSER_WEBAUTHN_FOCUS_HANDLERS['browser webauthn dialog-focus']({
    ...parsed,
    client,
    cwd: dir,
    json
  })
}
it.each([
  undefined,
  null,
  { applied: true },
  { applied: true, webAuthnFocus: { ...state, requestId: 'other' } },
  { applied: true, webAuthnFocus: { ...state, focused: false } }
])('refuses malformed/mismatched focus receipt %j', async (result) => {
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await expect(run()).rejects.toMatchObject({ code: 'runtime_error' })
  expect(output).not.toHaveBeenCalled()
})
it.each([true, false])('projects only public focus fields json=%s', async (json) => {
  const meta = { runtimeId: 'fixture', secret: 'PRIVATE_META' }
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: meta,
    result: {
      applied: true,
      credentialId: 'PRIVATE_CREDENTIAL',
      webAuthnFocus: { ...state, accountId: 'PRIVATE_CREDENTIAL', name: 'PRIVATE_ACCOUNT' }
    }
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await run(json)
  expect(output.mock.lastCall?.[0]).toContain('"focused": true')
  expect(output.mock.lastCall?.[0]).not.toContain('PRIVATE')
})
