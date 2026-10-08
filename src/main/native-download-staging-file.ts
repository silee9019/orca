import { open, lstat } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import {
  createSiblingTransferPath,
  inspectDownloadDestination,
  promoteDownloadedFile,
  cleanupLocalTransferPath
} from './ipc/filesystem/filesystem-download-promotion'
function identity(stat: Stats): string {
  return `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`
}
async function inspect(path: string): Promise<Stats | null> {
  try {
    return await lstat(path)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}
export class NativeDownloadStagingFile {
  private handle: FileHandle | null = null
  private tempPath: string | null = null
  private tempIdentity: string | null = null
  private destinationIdentity: string | null = null
  private destinationExisted = false
  private promoted = false
  private cleaning: Promise<boolean> | null = null
  constructor(private readonly destinationPath: string) {}
  async create(overwrite: boolean): Promise<void> {
    await this.inspectDestination(overwrite)
    const path = createSiblingTransferPath(this.destinationPath, 'download')
    this.handle = await open(path, 'wx')
    this.tempPath = path
    this.tempIdentity = identity(await this.handle.stat())
  }
  // Why: system SSH downloads create their target exclusively, so it must not exist yet.
  async reserve(overwrite: boolean): Promise<string> {
    await this.inspectDestination(overwrite)
    this.tempPath = createSiblingTransferPath(this.destinationPath, 'download')
    return this.tempPath
  }
  private async inspectDestination(overwrite: boolean): Promise<void> {
    const { existed } = await inspectDownloadDestination(this.destinationPath)
    const destination = await inspect(this.destinationPath)
    if (existed && (!overwrite || !destination?.isFile() || destination.isSymbolicLink())) {
      throw new Error('Selected destination cannot be replaced.')
    }
    if (existed !== Boolean(destination)) {
      throw new Error('Selected destination changed.')
    }
    this.destinationExisted = existed
    this.destinationIdentity = destination ? identity(destination) : null
  }
  async append(bytes: Buffer): Promise<void> {
    if (!this.handle) {
      throw new Error('No open owned download.')
    }
    await this.handle.writeFile(bytes)
  }
  async promote(signal: AbortSignal): Promise<void> {
    await this.close()
    signal.throwIfAborted()
    if (!this.tempPath || !(await this.ownsTemp())) {
      throw new Error('Owned temporary download changed.')
    }
    const destination = await inspect(this.destinationPath)
    if ((destination ? identity(destination) : null) !== this.destinationIdentity) {
      throw new Error('Selected destination changed.')
    }
    signal.throwIfAborted()
    await promoteDownloadedFile(this.tempPath, this.destinationPath, this.destinationExisted)
    this.promoted = true
    this.tempPath = null
  }
  async cleanup(): Promise<boolean> {
    if (this.cleaning) {
      return this.cleaning
    }
    this.cleaning = this.removeOwnedFile()
    try {
      return await this.cleaning
    } finally {
      this.cleaning = null
    }
  }
  private async removeOwnedFile(): Promise<boolean> {
    try {
      await this.close()
      if (!this.tempPath || this.promoted) {
        return true
      }
      if (!(await inspect(this.tempPath))) {
        this.tempPath = null
        return true
      }
      if (!(await this.ownsTemp())) {
        return false
      }
      await cleanupLocalTransferPath(this.tempPath)
      if (await inspect(this.tempPath)) {
        return false
      }
      this.tempPath = null
      return true
    } catch {
      return false
    }
  }
  private async close(): Promise<void> {
    if (this.handle) {
      await this.handle.close()
      this.handle = null
    }
  }
  private async ownsTemp(): Promise<boolean> {
    const stat = this.tempPath ? await inspect(this.tempPath) : null
    return Boolean(stat?.isFile() && (!this.tempIdentity || identity(stat) === this.tempIdentity))
  }
}
