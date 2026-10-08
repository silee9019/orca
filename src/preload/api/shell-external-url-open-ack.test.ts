import { expect, it } from 'vitest'
import { requireExternalUrlOpenAck } from './shell-external-url-open-ack'
it.each([undefined, null, {}, { opened: false }])(
  'rejects old-peer void and non-acknowledgments',
  async (response) => {
    await expect(requireExternalUrlOpenAck(async () => response)).rejects.toThrow(
      'external_url_open_unverifiable'
    )
  }
)
it('accepts an explicit native service acknowledgment', async () => {
  await expect(requireExternalUrlOpenAck(async () => ({ opened: true }))).resolves.toEqual({
    opened: true
  })
})
