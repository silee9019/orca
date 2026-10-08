export async function requireClipboardImageWriteAck(
  write: () => Promise<unknown>
): Promise<{ written: true }> {
  const result = await write()
  if (!result || typeof result !== 'object' || !('written' in result) || result.written !== true) {
    throw new Error('clipboard_image_write_unverifiable')
  }
  return { written: true }
}
