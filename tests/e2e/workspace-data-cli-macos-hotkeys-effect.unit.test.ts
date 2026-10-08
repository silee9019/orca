import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type * as ChildProcess from '../../src/shared/child-process/run-process'
import type { ProcessSpec } from '../../src/shared/child-process/process-spec'
import type { HandlerContext } from '../../src/cli/dispatch'

const fixture = vi.hoisted(() => ({
  script: '',
  ledger: '',
  output: '',
  hang: false,
  closed: new Array<Promise<unknown>>()
}))

vi.mock('../../src/shared/child-process/run-process', async (importOriginal) => {
  const original = await importOriginal<typeof ChildProcess>()
  return {
    ...original,
    spawnProcess: vi.fn((spec: ProcessSpec) => {
      const child = original.spawnProcess({
        program: process.execPath,
        args: [fixture.script],
        detached: spec.detached,
        stdio: spec.stdio,
        env: {
          ...process.env,
          ORCA_TEST_HOTKEY_LEDGER: fixture.ledger,
          ORCA_TEST_HOTKEY_OUTPUT: fixture.output,
          ORCA_TEST_HOTKEY_HANG: String(fixture.hang)
        }
      })
      fixture.closed.push(once(child, 'close'))
      return child
    })
  }
})

import { spawnProcess } from '../../src/shared/child-process/run-process'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { WORKSPACE_KEYBINDING_FILE_HANDLERS } from '../../src/cli/handlers/workspace-keybinding-file'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { WORKSPACE_MACOS_HOTKEY_METHODS } from '../../src/main/runtime/rpc/methods/workspace-macos-hotkeys'

let directory: string
let ctx: HandlerContext
const originalPlatform = process.platform

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-hotkey-'))
  fixture.script = join(directory, 'probe.cjs')
  fixture.ledger = join(directory, 'probe.json')
  fixture.hang = false
  fixture.closed = []
  fixture.output = JSON.stringify({
    AppleSymbolicHotKeys: {
      '118': { enabled: true, value: { type: 'standard', parameters: [65535, 18, 0x40000] } }
    },
    privatePreference: 'must-not-be-returned'
  })
  await writeFile(
    fixture.script,
    "const fs = require('node:fs'); fs.writeFileSync(process.env.ORCA_TEST_HOTKEY_LEDGER, JSON.stringify({pid:process.pid})); if (process.env.ORCA_TEST_HOTKEY_HANG === 'true') setInterval(() => {}, 1000); else process.stdout.write(process.env.ORCA_TEST_HOTKEY_OUTPUT);",
    { mode: 0o600 }
  )
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(),
    methods: WORKSPACE_MACOS_HOTKEY_METHODS
  })
  const client = new RuntimeClient(join(directory, 'client'))
  vi.spyOn(client, 'call').mockImplementation(async (method, params) => {
    const response = await dispatcher.dispatch({
      id: 'fixture',
      authToken: 'fixture',
      method,
      params
    })
    if (!response.ok) {
      throw new RuntimeClientError(response.error.code, response.error.message)
    }
    return response
  })
  ctx = { client, cwd: directory, json: true, flags: new Map() }
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.mocked(spawnProcess).mockClear()
})

afterEach(async () => {
  await Promise.all(fixture.closed)
  Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

it('runs the selected host probe and exposes only parsed physical chords', async () => {
  await WORKSPACE_KEYBINDING_FILE_HANDLERS['keybindings mac-captured-digit-row'](ctx)
  expect(JSON.parse(await readFile(fixture.ledger, 'utf8'))).toHaveProperty('pid')
  expect(spawnProcess).toHaveBeenCalledExactlyOnceWith({
    program: '/bin/sh',
    args: [
      '-c',
      '/usr/bin/defaults export com.apple.symbolichotkeys - | /usr/bin/plutil -convert json -o - -'
    ],
    detached: true,
    stdio: ['ignore', 'pipe', 'ignore']
  })
  expect(JSON.parse(vi.mocked(console.log).mock.calls[0][0])).toMatchObject({
    ok: true,
    result: [{ code: 'Digit1', meta: false, control: true, alt: false, shift: false }]
  })
  expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('privatePreference'))
})

it('keeps the existing empty result on non-macOS hosts without starting a process', async () => {
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
  await WORKSPACE_KEYBINDING_FILE_HANDLERS['keybindings mac-captured-digit-row'](ctx)
  expect(spawnProcess).not.toHaveBeenCalled()
  expect(JSON.parse(vi.mocked(console.log).mock.calls[0][0])).toMatchObject({
    ok: true,
    result: []
  })
})

it.each(['invalid-json', 'timeout'])('preserves the desktop %s fallback', async (mode) => {
  fixture.output = '{'
  fixture.hang = mode === 'timeout'
  await WORKSPACE_KEYBINDING_FILE_HANDLERS['keybindings mac-captured-digit-row'](ctx)
  expect(JSON.parse(vi.mocked(console.log).mock.calls[0][0])).toMatchObject({
    ok: true,
    result: []
  })
  expect(spawnProcess).toHaveBeenCalledTimes(1)
})

it('fails once on old hosts without a client-side OS probe', async () => {
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'old host')
  )
  await expect(
    WORKSPACE_KEYBINDING_FILE_HANDLERS['keybindings mac-captured-digit-row'](ctx)
  ).rejects.toMatchObject({ code: 'method_not_found' })
  expect(ctx.client.call).toHaveBeenCalledTimes(1)
  expect(spawnProcess).not.toHaveBeenCalled()
  expect(console.log).not.toHaveBeenCalled()
})
