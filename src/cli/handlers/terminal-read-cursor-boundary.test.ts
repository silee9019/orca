import { afterEach, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import { TERMINAL_HANDLERS } from './terminal'

afterEach(() => vi.restoreAllMocks())
it.each(['9007199254740993', '9'.repeat(400)])(
  'refuses an unsafe cursor before contacting the host',
  async (cursor) => {
    const call = vi
      .spyOn(RuntimeClient.prototype, 'call')
      .mockRejectedValue(new Error('unexpected RPC'))
    await expect(
      TERMINAL_HANDLERS['terminal read']({
        flags: new Map([
          ['terminal', 'term_fixture'],
          ['cursor', cursor]
        ]),
        client: new RuntimeClient(),
        cwd: '/fixture',
        json: true
      })
    ).rejects.toMatchObject({ code: 'invalid_argument' })
    expect(call).not.toHaveBeenCalled()
  }
)

it.each(['0', String(Number.MAX_SAFE_INTEGER)])('preserves safe cursor %s', async (cursor) => {
  const call = vi.spyOn(RuntimeClient.prototype, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result: {
      terminal: {
        handle: 'term_fixture',
        tail: [],
        status: 'running',
        truncated: false,
        nextCursor: null
      }
    }
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  await TERMINAL_HANDLERS['terminal read']({
    flags: new Map([
      ['terminal', 'term_fixture'],
      ['cursor', cursor]
    ]),
    client: new RuntimeClient(),
    cwd: '/fixture',
    json: true
  })
  expect(call).toHaveBeenCalledWith(
    'terminal.read',
    expect.objectContaining({ cursor: Number(cursor) })
  )
})
