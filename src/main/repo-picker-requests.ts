import { randomUUID } from 'node:crypto'
import type { RepoIconPickedImage, RepoIconPickerState } from '../shared/repo-icon-picker-types'
import type {
  RepoPickerKind,
  RepoPickerSelection,
  RepoPickerStatus,
  RepoFolderSelection
} from '../shared/repo-picker-types'
import { MAX_REPO_PICKER_PATHS, MAX_REPO_PICKER_PATH_LENGTH } from '../shared/repo-picker-types'
const RESULT_TTL_MS = 15 * 60 * 1000
const MAX_RESULTS = 8
type PickerRequest = {
  requestId: string
  state: RepoIconPickerState
  controller: AbortController
  kind: RepoPickerKind
  selection: RepoPickerSelection | null
  settledAt: number | null
  expiry: ReturnType<typeof setTimeout> | null
}
export class RepoPickerRequests {
  private readonly requests = new Map<string, PickerRequest>()
  private active: string | null = null
  constructor(
    private readonly pick: (
      kind: RepoPickerKind,
      signal: AbortSignal
    ) => Promise<RepoPickerSelection | null>
  ) {}
  start(kind: RepoPickerKind = 'icon'): RepoPickerStatus {
    this.prune()
    if (this.active) {
      throw new Error('A repo picker is already pending on this desktop.')
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
      kind,
      selection: null,
      settledAt: null,
      expiry: null
    }
    this.requests.set(request.requestId, request)
    this.active = request.requestId
    void Promise.resolve()
      .then(() => this.pick(request.kind, request.controller.signal))
      .then(
        (selection) => this.finish(request, selection, false),
        () => this.finish(request, null, true)
      )
    return this.snapshot(request)
  }
  status(requestId: string, scope?: 'icon' | 'folders'): RepoPickerStatus {
    return this.snapshot(this.get(requestId, scope))
  }
  cancel(requestId: string, scope?: 'icon' | 'folders'): RepoPickerStatus {
    const request = this.get(requestId, scope)
    request.controller.abort()
    request.selection = null
    request.state =
      request.state === 'pending' || request.state === 'cancel_requested'
        ? 'cancel_requested'
        : 'cancelled'
    return this.snapshot(request)
  }
  result(requestId: string): RepoIconPickedImage {
    const request = this.get(requestId, 'icon')
    if (request.state !== 'completed' || request.selection?.kind !== 'icon') {
      throw new Error('The picker has not produced a completed image.')
    }
    return { ...request.selection.image }
  }
  folderResult(requestId: string): RepoFolderSelection {
    const request = this.get(requestId, 'folders')
    if (request.state !== 'completed' || !request.selection || request.selection.kind === 'icon') {
      throw new Error('The picker has not produced a completed folder selection.')
    }
    return { kind: request.selection.kind, paths: [...request.selection.paths] }
  }
  dispose(): void {
    for (const request of this.requests.values()) {
      request.controller.abort()
      this.delete(request.requestId)
    }
    this.active = null
  }
  private finish(
    request: PickerRequest,
    selection: RepoPickerSelection | null,
    failed: boolean
  ): void {
    if (this.requests.get(request.requestId) !== request) {
      return
    }
    const invalidSelection = Boolean(
      selection &&
      (selection.kind !== request.kind ||
        (selection.kind !== 'icon' &&
          (selection.paths.length > MAX_REPO_PICKER_PATHS ||
            selection.paths.some(
              (path) => Buffer.byteLength(path, 'utf8') > MAX_REPO_PICKER_PATH_LENGTH
            ))))
    )
    request.state = request.controller.signal.aborted
      ? 'cancelled'
      : failed || invalidSelection
        ? 'failed'
        : selection
          ? 'completed'
          : 'cancelled'
    request.selection = request.state === 'completed' ? selection : null
    request.settledAt = Date.now()
    request.expiry = setTimeout(() => this.delete(request.requestId), RESULT_TTL_MS)
    request.expiry.unref()
    if (this.active === request.requestId) {
      this.active = null
    }
  }
  private get(requestId: string, scope?: 'icon' | 'folders'): PickerRequest {
    this.prune()
    const request = this.requests.get(requestId)
    if (
      !request ||
      (scope === 'icon' && request.kind !== 'icon') ||
      (scope === 'folders' && request.kind === 'icon')
    ) {
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
      request.selection = null
    }
    this.requests.delete(requestId)
  }
  private snapshot(request: PickerRequest): RepoPickerStatus {
    return {
      requestId: request.requestId,
      state: request.state,
      humanAction:
        request.state === 'pending'
          ? 'select-or-cancel-on-desktop'
          : request.state === 'cancel_requested'
            ? 'close-native-picker'
            : null,
      ...(request.kind !== 'icon' ? { selectionKind: request.kind } : {}),
      ...(request.selection?.kind === 'icon'
        ? {
            bytes: Buffer.from(
              request.selection.image.dataUrl.slice(
                request.selection.image.dataUrl.indexOf(',') + 1
              ),
              'base64'
            ).byteLength
          }
        : request.selection
          ? { selectedPathCount: request.selection.paths.length }
          : {})
    }
  }
}
