import { randomUUID } from 'node:crypto'
import { lstatSync, type Stats } from 'node:fs'
import { lstat, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promoteLocalDownloadedFolder } from './local-downloaded-folder-promotion'
import {
  isSafeOwnedDirectory,
  isMissingPathError,
  removeOwnedDirectory
} from './window/owned-temp-staging-root'
function identity(stats: Stats): string {
  return `${stats.dev}:${stats.ino}:${stats.birthtimeMs}`
}
export class NativeDownloadStagingDirectory {
  private path: string | null = null
  private ownedIdentity: string | null = null
  private cleaning: Promise<boolean> | null = null
  constructor(private readonly destinationPath: string) {}
  async create(): Promise<string> {
    try {
      await lstat(this.destinationPath)
      throw new Error('Destination folder already exists')
    } catch (error) {
      if (!isMissingPathError(error)) {
        throw error
      }
    }
    const path = join(dirname(this.destinationPath), `.${randomUUID()}.download`)
    await mkdir(path, { mode: 0o700, recursive: false })
    this.path = path
    const stats = lstatSync(path)
    if (
      !isSafeOwnedDirectory(stats) ||
      (stats.dev === 0 && stats.ino === 0 && stats.birthtimeMs === 0)
    ) {
      throw new Error('Native staging directory identity unavailable.')
    }
    this.ownedIdentity = identity(stats)
    return path
  }
  async promote(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    if (!this.path || !(await this.ownsPath())) {
      throw new Error('Owned folder staging changed.')
    }
    await promoteLocalDownloadedFolder(this.path, this.destinationPath, signal)
  }
  async cleanup(): Promise<boolean> {
    if (this.cleaning) {
      return this.cleaning
    }
    this.cleaning = this.remove()
    try {
      return await this.cleaning
    } finally {
      this.cleaning = null
    }
  }
  private async ownsPath(): Promise<boolean> {
    if (!this.path || !this.ownedIdentity) {
      return false
    }
    const stats = await lstat(this.path)
    return isSafeOwnedDirectory(stats) && identity(stats) === this.ownedIdentity
  }
  private async remove(): Promise<boolean> {
    if (!this.path) {
      return true
    }
    try {
      try {
        await lstat(this.path)
      } catch (error) {
        if (!isMissingPathError(error)) {
          throw error
        }
        this.path = null
        return true
      }
      if (!(await this.ownsPath())) {
        return false
      }
      await removeOwnedDirectory(this.path)
      try {
        await lstat(this.path)
        return false
      } catch (error) {
        if (!isMissingPathError(error)) {
          throw error
        }
      }
      this.path = null
      return true
    } catch {
      return false
    }
  }
}
