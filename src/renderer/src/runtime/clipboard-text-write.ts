export async function writeVerifiedClipboardText(text: string): Promise<boolean> {
  await window.api.ui.writeClipboardText(text)
  return (await window.api.ui.readClipboardText()) === text
}
