import {
  assertClipboardImageBase64LengthWithinLimit,
  assertClipboardImageByteLengthWithinLimit,
  assertClipboardImageDimensionsWithinLimit
} from '../../shared/clipboard-image'
export function writeClipboardImageWithAck<
  Image extends {
    isEmpty: () => boolean
    getSize: () => { width: number; height: number }
  }
>(
  dataUrl: string,
  requireWrite: boolean,
  decode: (buffer: Buffer) => Image,
  write: (image: Image) => void
): { written: true } | undefined {
  const reject = (): undefined => {
    if (requireWrite) {
      throw new Error('clipboard_image_write_rejected')
    }
    return undefined
  }
  const prefix = 'data:image/png;base64,'
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(prefix)) {
    return reject()
  }
  const contentBase64 = dataUrl.slice(prefix.length)
  try {
    assertClipboardImageBase64LengthWithinLimit(contentBase64.length)
  } catch {
    return reject()
  }
  const buffer = Buffer.from(contentBase64, 'base64')
  try {
    assertClipboardImageByteLengthWithinLimit(buffer.byteLength)
  } catch {
    return reject()
  }
  const image = decode(buffer)
  if (image.isEmpty()) {
    return reject()
  }
  try {
    assertClipboardImageDimensionsWithinLimit(image.getSize())
  } catch {
    return reject()
  }
  write(image)
  return requireWrite ? { written: true } : undefined
}
