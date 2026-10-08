export async function openExternalUrlWithAck(
  rawUrl: string,
  requireOpen: boolean,
  openExternal: (url: string) => Promise<void>
): Promise<void | { opened: true }> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    if (requireOpen) {
      throw new Error('external_url_invalid')
    }
    return
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    if (requireOpen) {
      throw new Error('external_url_unsupported_protocol')
    }
    return
  }
  try {
    await openExternal(parsed.toString())
  } catch (error) {
    if (requireOpen) {
      throw new Error('external_url_open_failed')
    }
    throw error
  }
  if (requireOpen) {
    return { opened: true }
  }
}
