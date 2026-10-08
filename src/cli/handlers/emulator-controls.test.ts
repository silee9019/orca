import type * as ImportedModule from '../runtime-client'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { callMock } = vi.hoisted(() => ({ callMock: vi.fn() }))
vi.mock('../runtime-client', async () => {
  const actual = await vi.importActual<typeof ImportedModule>('../runtime-client')
  return {
    ...actual,
    RuntimeClient: class {
      readonly isRemote = false
      call = callMock
    }
  }
})

import { normalizeCommandPositionals, parseArgs, validateCommandAndFlags } from '../args'
import { RuntimeClient, RuntimeRpcFailureError } from '../runtime-client'
import { EMULATOR_COMMAND_SPECS } from '../specs/emulator'
import { okFixture } from '../test-fixtures'
import { EMULATOR_HANDLERS } from './emulator'

async function run(argv: string[]): Promise<void> {
  const parsed = normalizeCommandPositionals(
    EMULATOR_COMMAND_SPECS,
    parseArgs(
      argv,
      EMULATOR_COMMAND_SPECS.map((spec) => spec.path),
      EMULATOR_COMMAND_SPECS
    )
  )
  validateCommandAndFlags(EMULATOR_COMMAND_SPECS, parsed)
  const handler = EMULATOR_HANDLERS[parsed.commandPath.join(' ')]
  if (!handler) {
    throw new Error(`Missing handler: ${parsed.commandPath.join(' ')}`)
  }
  await handler({ ...parsed, client: new RuntimeClient(), cwd: '/folder/project', json: true })
}

describe('emulator host controls', () => {
  beforeEach(() => {
    callMock.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    callMock.mockResolvedValue(okFixture('fixture', { ok: true }))
  })
  afterEach(() => vi.restoreAllMocks())

  it.each([
    ['availability', 'emulator.availability'],
    ['simulators', 'emulator.listSimulators'],
    ['detach', 'emulator.unregisterActive']
  ])('exposes %s on the selected folder workspace', async (command, method) => {
    expect(
      EMULATOR_COMMAND_SPECS.find((spec) => spec.path.join(' ') === `emulator ${command}`)
    ).toBeDefined()
    await run(['emulator', command, '--worktree', 'folder:mobile'])
    expect(callMock).toHaveBeenCalledExactlyOnceWith(method, { worktree: 'folder:mobile' })
  })

  it('waits for viewer focus read-back before reporting a focused attachment', async () => {
    callMock.mockResolvedValueOnce(
      okFixture('attach', { attached: true, info: { deviceUdid: 'fixture' } })
    )
    callMock.mockRejectedValueOnce(new Error('viewer_focus_timeout_applied_unknown'))
    await expect(
      run(['emulator', 'attach', 'fixture', '--focus', '--worktree', 'folder:mobile'])
    ).rejects.toThrow('viewer_focus_timeout_applied_unknown')
    expect(callMock).toHaveBeenNthCalledWith(2, 'emulator.focus', { worktree: 'folder:mobile' })
    expect(console.log).not.toHaveBeenCalled()
  })

  it('routes a shifted named key to the active workspace', async () => {
    await run(['emulator', 'key', 'ArrowLeft', '--shift', '--worktree', 'folder:mobile'])
    expect(callMock).toHaveBeenCalledExactlyOnceWith('emulator.control', {
      worktree: 'folder:mobile',
      events: [{ type: 'key', key: 'ArrowLeft', shift: true }]
    })
  })

  it('rejects an unbounded input sequence before contacting the host', async () => {
    await expect(
      run([
        'emulator',
        'control',
        '--text',
        '[{"type":"wait","ms":60000},{"type":"wait","ms":1}]',
        '--worktree',
        'folder:mobile'
      ])
    ).rejects.toThrow('Invalid emulator control')
    expect(callMock).not.toHaveBeenCalled()
  })

  it('preserves old-peer failures instead of claiming the device detached', async () => {
    const failure = new RuntimeRpcFailureError({
      id: 'fixture',
      ok: false,
      error: { code: 'method_not_found', message: 'Unsupported on this host' },
      _meta: { runtimeId: 'old-host' }
    })
    callMock.mockRejectedValue(failure)
    await expect(run(['emulator', 'detach', '--worktree', 'folder:mobile'])).rejects.toBe(failure)
    expect(console.log).not.toHaveBeenCalled()
  })

  it('reads exact text from stdin without echoing it', async () => {
    const input = Readable.from(['private ', 'payload\n'])
    vi.spyOn(process.stdin, Symbol.asyncIterator).mockImplementation(
      input[Symbol.asyncIterator].bind(input)
    )
    await run([
      'emulator',
      'type',
      '--text-stdin',
      '--device',
      'emulator-5554',
      '--worktree',
      'all'
    ])
    expect(callMock).toHaveBeenCalledExactlyOnceWith('emulator.type', {
      text: 'private payload\n',
      device: 'emulator-5554',
      emulator: undefined,
      worktree: undefined
    })
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private payload')
  })

  it('rejects stdin and positional text together before contacting the host', async () => {
    await expect(
      run(['emulator', 'type', 'payload', '--text-stdin', '--worktree', 'all'])
    ).rejects.toThrow('Use either --text or --text-stdin')
    expect(callMock).not.toHaveBeenCalled()
  })
})
