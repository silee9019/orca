import { dialog } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { MAX_REPO_ICON_UPLOAD_BYTES } from '../shared/repo-icon'
import type { RepoIconPickedImage } from '../shared/repo-icon-picker-types'

export async function pickRepoIconImage(signal?: AbortSignal): Promise<RepoIconPickedImage | null> {
  if (signal?.aborted) {
    return null
  }
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Repo icon images', extensions: ['png'] }]
  })
  if (signal?.aborted || result.canceled || result.filePaths.length === 0) {
    return null
  }
  const filePath = result.filePaths[0]
  if (extname(filePath).toLowerCase() !== '.png') {
    throw new Error('Repo icons must be PNG files.')
  }
  const stats = await stat(filePath)
  if (stats.size > MAX_REPO_ICON_UPLOAD_BYTES) {
    throw new Error('Repo icon image must be 256KB or smaller.')
  }
  if (signal?.aborted) {
    return null
  }
  const buffer = await readFile(filePath)
  if (signal?.aborted) {
    return null
  }
  if (buffer.byteLength > MAX_REPO_ICON_UPLOAD_BYTES) {
    throw new Error('Repo icon image must be 256KB or smaller.')
  }
  return {
    dataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
    fileName: basename(filePath)
  }
}
