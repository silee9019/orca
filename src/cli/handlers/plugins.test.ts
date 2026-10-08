import { afterEach, describe, expect, it, vi } from 'vitest'
import { PLUGIN_HANDLERS } from './plugins'
import { RuntimeClient } from '../runtime-client'

const client = new RuntimeClient('/unused-extensions-fixture')
const call = vi.spyOn(client, 'call')
afterEach(() => vi.restoreAllMocks())

describe('plugin CLI input contract', () => {
  it('lists through the selected runtime', async () => {
    call.mockResolvedValue({ id: 'test', ok: true, result: [], _meta: { runtimeId: 'fixture' } })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const handler = PLUGIN_HANDLERS['plugins list']
    if (!handler) {
      throw new Error('missing plugins list')
    }
    await handler({ flags: new Map(), client, cwd: '/folder', json: true })
    expect(call).toHaveBeenCalledWith('plugins.list')
  })
})
