import { open, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { CommandHandler } from '../dispatch'
import { getRequiredStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime-client'
import { runViewerCommand } from './browser-viewer-command'
const MAX_POINTS_BYTES = 256 * 1024
async function readGesturePoints(path: string): Promise<unknown> {
  const info = await stat(path)
  if (!info.isFile() || info.size > MAX_POINTS_BYTES) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Points input must be a regular file of at most 256 KiB.'
    )
  }
  const file = await open(path, 'r')
  try {
    const bytes = Buffer.alloc(MAX_POINTS_BYTES + 1)
    let length = 0
    while (length < bytes.length) {
      const read = await file.read(bytes, length, bytes.length - length, length)
      if (read.bytesRead === 0) {
        break
      }
      length += read.bytesRead
    }
    if (length > MAX_POINTS_BYTES) {
      throw new RuntimeClientError('invalid_argument', 'Points input exceeds 256 KiB.')
    }
    try {
      return JSON.parse(bytes.subarray(0, length).toString('utf8'))
    } catch {
      throw new RuntimeClientError(
        'invalid_argument',
        'Points file must contain a JSON array of normalized x/y pairs.'
      )
    }
  } finally {
    await file.close()
  }
}
export const BROWSER_MARKUP_GESTURE_HANDLERS: Record<string, CommandHandler> = {
  'browser markup gesture': async (ctx) => {
    const viewer = getRequiredStringFlag(ctx.flags, 'viewer')
    const page = getRequiredStringFlag(ctx.flags, 'page')
    const cancel = ctx.flags.get('cancel')
    if (cancel !== undefined && typeof cancel !== 'boolean') {
      throw new RuntimeClientError('invalid_argument', '--cancel takes no value.')
    }
    let points: unknown
    try {
      points = await readGesturePoints(
        resolve(ctx.cwd, getRequiredStringFlag(ctx.flags, 'points-file'))
      )
    } catch (error) {
      if (error instanceof RuntimeClientError) {
        throw error
      }
      throw new RuntimeClientError('invalid_argument', 'Cannot read the points file.')
    }
    await runViewerCommand(ctx, {
      viewer,
      page,
      operation: 'markup-editor',
      command: { action: 'gesture', points, cancel: cancel === true }
    })
  }
}
