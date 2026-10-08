export async function requireExternalUrlOpenAck(
  invoke: () => Promise<unknown>
): Promise<{ opened: true }> {
  const response = await invoke()
  if (
    !response ||
    typeof response !== 'object' ||
    !('opened' in response) ||
    response.opened !== true
  ) {
    throw new Error('external_url_open_unverifiable')
  }
  return { opened: true }
}
