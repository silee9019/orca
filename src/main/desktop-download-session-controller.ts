import { randomUUID } from 'node:crypto'
import { NativeDownloadStagingFile } from './native-download-staging-file'
import { decodeDownloadedFileContent } from './ipc/filesystem/filesystem-download-promotion'
type Request = {
  id: string
  state: 'pending' | 'open' | 'finishing' | 'cancel_requested' | 'finished' | 'cancelled' | 'failed'
  controller: AbortController
  staging: NativeDownloadStagingFile | null
  operation: Promise<void>
  busy: boolean
  byteOffset: number
  cleanupPending: boolean
  expiresAt: number
  timer: ReturnType<typeof setTimeout> | null
}
const TTL = 15 * 60 * 1000
export class DesktopDownloadSessionController {
  private request: Request | null = null
  start(authorize: () => Promise<string>, overwrite: boolean) {
    if (
      this.request &&
      (this.request.busy ||
        ['pending', 'open', 'finishing', 'cancel_requested'].includes(this.request.state) ||
        this.request.cleanupPending)
    ) {
      throw new Error('desktop_download_session_busy')
    }
    if (this.request?.timer) {
      clearTimeout(this.request.timer)
    }
    const request: Request = {
      id: randomUUID(),
      state: 'pending',
      controller: new AbortController(),
      staging: null,
      operation: Promise.resolve(),
      busy: true,
      byteOffset: 0,
      cleanupPending: false,
      expiresAt: 0,
      timer: null
    }
    this.request = request
    request.operation = Promise.resolve()
      .then(authorize)
      .then(async (path) => {
        request.controller.signal.throwIfAborted()
        request.staging = new NativeDownloadStagingFile(path)
        request.cleanupPending = true
        await request.staging.create(overwrite)
        request.controller.signal.throwIfAborted()
        request.state = 'open'
      })
      .catch(() => {
        request.state = 'failed'
      })
      .finally(async () => {
        request.busy = false
        if (request.controller.signal.aborted || request.state === 'failed') {
          await this.clean(request)
        }
        this.arm(request)
      })
    this.arm(request)
    return this.status(request.id)
  }
  status(id: string) {
    const r = this.get(id)
    return {
      requestId: id,
      state: r.state,
      byteOffset: r.byteOffset,
      cleanupPending: r.cleanupPending
    }
  }
  async append(id: string, offset: number, contentBase64: string) {
    const r = this.get(id)
    if (r.state !== 'open' || r.busy || !r.staging) {
      throw new Error('desktop_download_session_busy')
    }
    if (offset !== r.byteOffset) {
      throw new Error('download_byte_offset_mismatch')
    }
    const bytes = decodeDownloadedFileContent(contentBase64, 'base64')
    if (
      bytes.length < 1 ||
      bytes.length > 1024 * 1024 ||
      r.byteOffset + bytes.length > 64 * 1024 * 1024
    ) {
      throw new Error('download_size_limit')
    }
    r.busy = true
    const staging = r.staging
    r.operation = staging
      .append(bytes)
      .then(() => {
        r.byteOffset += bytes.length
      })
      .catch(() => {
        r.state = 'failed'
      })
      .finally(async () => {
        r.busy = false
        if (r.controller.signal.aborted || r.state === 'failed') {
          await this.clean(r)
        }
        this.arm(r)
      })
    await r.operation
    if (r.state !== 'open') {
      throw new Error('Owned download append did not complete.')
    }
    return this.status(id)
  }
  async finish(id: string) {
    const r = this.get(id)
    if (r.state !== 'open' || r.busy || !r.staging) {
      throw new Error('desktop_download_session_busy')
    }
    r.busy = true
    r.state = 'finishing'
    const staging = r.staging
    r.operation = staging
      .promote(r.controller.signal)
      .then(() => {
        r.state = 'finished'
        r.cleanupPending = false
      })
      .catch(() => {
        r.state = 'failed'
      })
      .finally(async () => {
        r.busy = false
        if (!this.isFinished(r)) {
          await this.clean(r)
        }
        this.arm(r)
      })
    await r.operation
    return this.status(id)
  }
  async cancel(id: string) {
    const r = this.get(id)
    if (r.state === 'finished') {
      return this.status(id)
    }
    r.controller.abort()
    r.state = 'cancel_requested'
    await r.operation
    if (!this.isFinished(r)) {
      await this.clean(r)
    }
    this.arm(r)
    return this.status(id)
  }
  dispose(): void {
    const r = this.request
    if (!r) {
      return
    }
    if (r.timer) {
      clearTimeout(r.timer)
    }
    r.controller.abort()
    void r.operation.then(async () => {
      if (!this.isFinished(r)) {
        await this.clean(r)
      }
      if (r.timer) {
        clearTimeout(r.timer)
      }
      if (this.request === r && !r.cleanupPending) {
        this.request = null
      }
    })
  }
  private isFinished(r: Request): boolean {
    return r.state === 'finished'
  }
  private async clean(r: Request): Promise<void> {
    r.cleanupPending = r.staging ? !(await r.staging.cleanup()) : false
    r.state = r.cleanupPending ? 'failed' : r.controller.signal.aborted ? 'cancelled' : 'failed'
  }
  private arm(r: Request): void {
    if (this.request !== r) {
      return
    }
    if (r.timer) {
      clearTimeout(r.timer)
    }
    r.expiresAt = Date.now() + TTL
    r.timer = setTimeout(() => {
      if (this.request !== r) {
        return
      }
      if (
        ['pending', 'open', 'finishing', 'cancel_requested'].includes(r.state) ||
        r.cleanupPending
      ) {
        void this.cancelExpired(r)
      } else {
        this.request = null
      }
    }, TTL)
    r.timer.unref()
  }
  private get(id: string): Request {
    const r = this.request
    if (!r || r.id !== id) {
      throw new Error('selector_not_found')
    }
    if (Date.now() >= r.expiresAt) {
      if (
        ['pending', 'open', 'finishing', 'cancel_requested'].includes(r.state) ||
        r.cleanupPending
      ) {
        void this.cancelExpired(r)
      } else {
        if (r.timer) {
          clearTimeout(r.timer)
        }
        this.request = null
        throw new Error('selector_not_found')
      }
    }
    return r
  }
  private async cancelExpired(r: Request): Promise<void> {
    this.arm(r)
    r.controller.abort()
    r.state = 'cancel_requested'
    await r.operation
    if (!this.isFinished(r)) {
      await this.clean(r)
    }
    this.arm(r)
  }
}
