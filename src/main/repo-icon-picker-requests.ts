import { randomUUID } from 'node:crypto'
import type {
  RepoIconPickedImage,
  RepoIconPickerState,
  RepoIconPickerStatus
} from '../shared/repo-icon-picker-types'
const RESULT_TTL_MS = 15 * 60 * 1000
const MAX_RESULTS = 8
type PickerRequest = {
  requestId: string
  state: RepoIconPickerState
  controller: AbortController
  image: RepoIconPickedImage | null
  settledAt: number | null
  expiry: ReturnType<typeof setTimeout> | null
}
export class RepoIconPickerRequests {
  private readonly requests = new Map<string, PickerRequest>()
  private active: string | null = null
  constructor(
    private readonly pick: (signal: AbortSignal) => Promise<RepoIconPickedImage | null>
  ) {}
  start(): RepoIconPickerStatus {
    this.prune()
    if (this.active) {
      throw new Error('A repo icon picker is already pending on this desktop.')
    }
    while (this.requests.size >= MAX_RESULTS) {
      const oldest = this.requests.keys().next().value
      if (typeof oldest === 'string') {
        this.delete(oldest)
      }
    }
    const request: PickerRequest = {
      requestId: randomUUID(),
      state: 'pending',
      controller: new AbortController(),
      image: null,
      settledAt: null,
      expiry: null
    }
    this.requests.set(request.requestId, request)
    this.active = request.requestId
    void Promise.resolve()
      .then(() => this.pick(request.controller.signal))
      .then(
        (image) => this.finish(request, image, false),
        () => this.finish(request, null, true)
      )
    return this.snapshot(request)
  }
  status(requestId: string): RepoIconPickerStatus {
    return this.snapshot(this.get(requestId))
  }
  cancel(requestId: string): RepoIconPickerStatus {
    const request = this.get(requestId)
    request.controller.abort()
    request.image = null
    request.state =
      request.state === 'pending' || request.state === 'cancel_requested'
        ? 'cancel_requested'
        : 'cancelled'
    return this.snapshot(request)
  }
  result(requestId: string): RepoIconPickedImage {
    const request = this.get(requestId)
    if (request.state !== 'completed' || !request.image) {
      throw new Error('The picker has not produced a completed image.')
    }
    return { ...request.image }
  }
  dispose(): void {
    for (const request of this.requests.values()) {
      request.controller.abort()
      this.delete(request.requestId)
    }
    this.active = null
  }
  private finish(request: PickerRequest, image: RepoIconPickedImage | null, failed: boolean): void {
    if (this.requests.get(request.requestId) !== request) {
      return
    }
    request.state = request.controller.signal.aborted
      ? 'cancelled'
      : failed
        ? 'failed'
        : image
          ? 'completed'
          : 'cancelled'
    request.image = request.state === 'completed' ? image : null
    request.settledAt = Date.now()
    request.expiry = setTimeout(() => this.delete(request.requestId), RESULT_TTL_MS)
    request.expiry.unref()
    if (this.active === request.requestId) {
      this.active = null
    }
  }
  private get(requestId: string): PickerRequest {
    this.prune()
    const request = this.requests.get(requestId)
    if (!request) {
      throw new Error('selector_not_found')
    }
    return request
  }
  private prune(): void {
    for (const request of this.requests.values()) {
      if (request.settledAt !== null && Date.now() - request.settledAt >= RESULT_TTL_MS) {
        this.delete(request.requestId)
      }
    }
  }
  private delete(requestId: string): void {
    const request = this.requests.get(requestId)
    if (request) {
      if (request.expiry) {
        clearTimeout(request.expiry)
      }
      request.image = null
    }
    this.requests.delete(requestId)
  }
  private snapshot(request: PickerRequest): RepoIconPickerStatus {
    return {
      requestId: request.requestId,
      state: request.state,
      humanAction:
        request.state === 'pending'
          ? 'select-or-cancel-on-desktop'
          : request.state === 'cancel_requested'
            ? 'close-native-picker'
            : null,
      ...(request.image
        ? {
            bytes: Buffer.from(
              request.image.dataUrl.slice(request.image.dataUrl.indexOf(',') + 1),
              'base64'
            ).byteLength
          }
        : {})
    }
  }
}
