import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import { SPEECH_HANDLERS } from './speech'
import { SPEECH_COMMAND_SPECS } from '../specs/speech'

afterEach(() => vi.restoreAllMocks())

describe('speech CLI', () => {
  it('provides a handler for every speech command', () => {
    for (const spec of SPEECH_COMMAND_SPECS) {
      expect(SPEECH_HANDLERS[spec.path.join(' ')]).toBeTypeOf('function')
    }
  })

  it('cancels the specified model download on the selected runtime', async () => {
    const call = vi.spyOn(RuntimeClient.prototype, 'call').mockResolvedValue({
      id: 'req',
      ok: true,
      result: { cancelled: true },
      _meta: { runtimeId: 'fixture-host' }
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const handler = SPEECH_HANDLERS['speech models cancel']
    if (!handler) {
      throw new Error('Missing cancel handler')
    }
    await handler({
      flags: new Map([['model', 'fixture-model']]),
      client: new RuntimeClient('/unused'),
      cwd: '/unused',
      json: true
    })
    expect(call).toHaveBeenCalledWith('speech.models.cancel', { modelId: 'fixture-model' })
    expect(log).toHaveBeenCalledWith(expect.stringContaining('fixture-host'))
  })

  it('rejects an invalid mode without contacting the runtime', async () => {
    const call = vi.spyOn(RuntimeClient.prototype, 'call')
    const handler = SPEECH_HANDLERS['speech setup']
    if (!handler) {
      throw new Error('Missing setup handler')
    }
    await expect(
      handler({
        flags: new Map([['mode', 'invalid']]),
        client: new RuntimeClient('/unused'),
        cwd: '/unused',
        json: true
      })
    ).rejects.toThrow('mode')
    expect(call).not.toHaveBeenCalled()
  })
  it('rejects a false key-save acknowledgement without echoing input', async () => {
    vi.spyOn(process.stdin, Symbol.asyncIterator).mockImplementation(() =>
      Readable.from([Buffer.from('fixture-private-key')])[Symbol.asyncIterator]()
    )
    vi.spyOn(RuntimeClient.prototype, 'call').mockResolvedValue({
      id: 'fixture',
      ok: true,
      result: { configured: false, apiKey: 'fixture-private-key' },
      _meta: { runtimeId: 'fixture' }
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const handler = SPEECH_HANDLERS['speech key save']
    if (!handler) {
      throw new Error('Missing handler')
    }
    await expect(
      handler({
        client: new RuntimeClient('/unused'),
        flags: new Map([['input-file', '-']]),
        cwd: '/unused',
        json: true
      })
    ).rejects.toThrow('did not confirm')
    expect(log).not.toHaveBeenCalled()
  })
})
