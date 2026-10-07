import { expect, it } from 'vitest'
import { requireClipboardImageWriteAck } from './clipboard-image-write-ack'
it('requires a typed write ack and rejects legacy void or malformed responses', async () => {
  expect(await requireClipboardImageWriteAck(async () => ({ written: true }))).toEqual({
    written: true
  })
  for (const value of [undefined, null, false, {}, { written: false }]) {
    await expect(requireClipboardImageWriteAck(async () => value)).rejects.toThrow(
      'clipboard_image_write_unverifiable'
    )
  }
  await expect(
    requireClipboardImageWriteAck(async () => {
      throw new Error('native rejected')
    })
  ).rejects.toThrow('native rejected')
})
