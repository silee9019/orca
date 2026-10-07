import { expect, it, vi } from 'vitest'
import { CLIPBOARD_IMAGE_MAX_PIXELS } from '../../shared/clipboard-image'
import { writeClipboardImageWithAck } from './clipboard-image-write'
it('acknowledges only an actual native write and preserves the legacy void result', () => {
  const image = { isEmpty: () => false, getSize: () => ({ width: 2, height: 3 }) }
  const decode = vi.fn().mockReturnValue(image)
  const write = vi.fn()
  expect(writeClipboardImageWithAck('data:image/png;base64,AAAA', true, decode, write)).toEqual({
    written: true
  })
  expect(write).toHaveBeenCalledExactlyOnceWith(image)
  expect(
    writeClipboardImageWithAck('data:image/png;base64,AAAA', false, decode, write)
  ).toBeUndefined()
})
it('rejects invalid, empty, oversized and native failed writes only when explicitly required', () => {
  const decode = vi
    .fn()
    .mockReturnValue({ isEmpty: () => true, getSize: () => ({ width: 1, height: 1 }) })
  const write = vi.fn()
  for (const source of ['invalid', 'data:image/png;base64,AAAA']) {
    expect(() => writeClipboardImageWithAck(source, true, decode, write)).toThrow(
      'clipboard_image_write_rejected'
    )
    expect(writeClipboardImageWithAck(source, false, decode, write)).toBeUndefined()
  }
  decode.mockReturnValue({
    isEmpty: () => false,
    getSize: () => ({ width: CLIPBOARD_IMAGE_MAX_PIXELS + 1, height: 1 })
  })
  expect(() =>
    writeClipboardImageWithAck('data:image/png;base64,AAAA', true, decode, write)
  ).toThrow('clipboard_image_write_rejected')
  expect(write).not.toHaveBeenCalled()
  decode.mockReturnValue({ isEmpty: () => false, getSize: () => ({ width: 1, height: 1 }) })
  write.mockImplementation(() => {
    throw new Error('native rejected')
  })
  expect(() =>
    writeClipboardImageWithAck('data:image/png;base64,AAAA', true, decode, write)
  ).toThrow('native rejected')
})
