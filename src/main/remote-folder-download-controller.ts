import { randomUUID } from 'node:crypto'
import { NativeDownloadStagingDirectory } from './native-download-staging-directory'
type Request = {
  id: string
  state:
    | 'pending'
    | 'downloading'
    | 'promoting'
    | 'completed'
    | 'cancel_requested'
    | 'cancelled'
    | 'failed'
  controller: AbortController
  staging: NativeDownloadStagingDirectory | null
  operation: Promise<void>
  busy: boolean
  cancelling: number
  cleanupPending: boolean
  timer: ReturnType<typeof setTimeout> | null
}
const TTL = 15 * 60 * 1000
export class RemoteFolderDownloadController {
  private request: Request | null = null
  hasUnfinishedWork(): boolean {
    return (
      !!this.request &&
      (this.request.busy || this.request.cleanupPending || this.request.cancelling > 0)
    )
  }
  start(
    authorize: () => Promise<string>,
    download: (tempPath: string, signal: AbortSignal) => Promise<void>
  ) {
    if (
      this.request &&
      (this.request.busy || this.request.cleanupPending || this.request.cancelling > 0)
    ) {
      throw new Error('remote_folder_download_busy')
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
      cancelling: 0,
      cleanupPending: false,
      timer: null
    }
    this.request = request
    request.operation = Promise.resolve()
      .then(authorize)
      .then(async (destination) => {
        request.controller.signal.throwIfAborted()
        request.staging = new NativeDownloadStagingDirectory(destination)
        request.cleanupPending = true
        const tempPath = await request.staging.create()
        request.controller.signal.throwIfAborted()
        request.state = 'downloading'
        await download(tempPath, request.controller.signal)
        request.controller.signal.throwIfAborted()
        request.state = 'promoting'
        await request.staging.promote(request.controller.signal)
        request.state = 'completed'
      })
      .catch(() => {
        request.state = request.controller.signal.aborted ? 'cancelled' : 'failed'
      })
      .finally(async () => {
        request.cleanupPending = request.staging ? !(await request.staging.cleanup()) : false
        if (request.cleanupPending && request.state !== 'completed') {
          request.state = 'failed'
        }
        request.busy = false
        this.arm(request)
      })
    this.arm(request)
    return this.status(request.id)
  }
  status(id: string) {
    const request = this.get(id)
    return { requestId: id, state: request.state, cleanupPending: request.cleanupPending }
  }
  async cancel(id: string) {
    const request = this.get(id)
    request.cancelling++
    try {
      if (request.state !== 'completed') {
        request.controller.abort()
        request.state = 'cancel_requested'
      }
      await request.operation
      if (request.cleanupPending && request.staging) {
        request.cleanupPending = !(await request.staging.cleanup())
      }
      if (request.state !== 'completed') {
        request.state = request.cleanupPending ? 'failed' : 'cancelled'
      }
      this.arm(request)
      return this.status(id)
    } finally {
      request.cancelling--
    }
  }
  async dispose(): Promise<void> {
    const request = this.request
    if (!request) {
      return
    }
    await this.cancel(request.id)
    if (request.timer) {
      clearTimeout(request.timer)
    }
    if (!request.cleanupPending && this.request === request) {
      this.request = null
    }
  }
  private get(id: string): Request {
    const request = this.request
    if (!request || request.id !== id) {
      throw new Error('selector_not_found')
    }
    return request
  }
  private arm(request: Request): void {
    if (this.request !== request) {
      return
    }
    if (request.timer) {
      clearTimeout(request.timer)
    }
    request.timer = setTimeout(() => {
      if (this.request !== request) {
        return
      }
      if (request.busy || request.cleanupPending) {
        void this.cancel(request.id).catch(() => {})
      } else {
        this.request = null
      }
    }, TTL)
    request.timer.unref()
  }
}
