import { fileURLToPath } from 'node:url'

export function parseDesktopFileUri(rawUri: string): string | null {
  try {
    const parsed = new URL(rawUri)
    if (parsed.protocol !== 'file:' || (parsed.hostname && parsed.hostname !== 'localhost')) {
      return null
    }
    return fileURLToPath(parsed)
  } catch {
    return null
  }
}
