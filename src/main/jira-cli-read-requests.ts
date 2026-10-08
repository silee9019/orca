import { randomUUID } from 'node:crypto'
import { JiraCancellableRequests } from './ipc/jira-cancellable-requests'

type ReadRequest<T> = {
  state: 'pending' | 'cancel_requested' | 'completed' | 'cancelled' | 'failed'
  result?: T
  timer: ReturnType<typeof setTimeout>
}
export class JiraCliReadRequests<T> {
  private readonly cancellations = new JiraCancellableRequests()
  private readonly requests = new Map<string, ReadRequest<T>>()
  start(task: (signal: AbortSignal) => Promise<T>) {
    if (this.requests.size >= 32) {
      throw new Error('jira_cli_read_busy')
    }
    const id = randomUUID()
    const request: ReadRequest<T> = {
      state: 'pending',
      timer: setTimeout(() => this.cancel(id), 30_000)
    }
    request.timer.unref()
    this.requests.set(id, request)
    void this.cancellations.run(id, async (signal) => {
      try {
        const result = await task(signal)
        signal.throwIfAborted()
        request.result = result
        request.state = 'completed'
      } catch {
        request.state = signal.aborted ? 'cancelled' : 'failed'
      } finally {
        clearTimeout(request.timer)
        if (this.requests.get(id) === request) {
          request.timer = setTimeout(() => this.requests.delete(id), 60_000)
          request.timer.unref()
        }
      }
    })
    return this.status(id)
  }
  status(id: string) {
    const request = this.requests.get(id)
    if (!request) {
      throw new Error('selector_not_found')
    }
    return { requestId: id, state: request.state, result: request.result }
  }
  cancel(id: string) {
    const request = this.requests.get(id)
    if (!request) {
      throw new Error('selector_not_found')
    }
    if (request.state === 'pending' || request.state === 'cancel_requested') {
      request.state = 'cancel_requested'
      this.cancellations.cancel(id)
    }
    return this.status(id)
  }
  dispose(): void {
    for (const [id, request] of this.requests) {
      clearTimeout(request.timer)
      if (request.state === 'pending' || request.state === 'cancel_requested') {
        this.cancellations.cancel(id)
      }
    }
    this.requests.clear()
  }
}
