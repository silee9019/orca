type Response<Result> = { id: string } & (
  | { ok: true; result: Result }
  | { ok: false; error: string }
)

export function attachHelpModalRequestQueue<Request extends { id: string }, Result>(
  subscribe: ((callback: (request: Request) => void) => () => void) | undefined,
  respond: ((response: Response<Result & { viewerId: number }>) => void) | undefined,
  apply: (request: Request, available: () => boolean) => Promise<Result>,
  rootAvailable: () => boolean,
  rootGeneration: () => number
): () => void {
  if (!subscribe || !respond) {
    return () => {}
  }
  let queue = Promise.resolve()
  let disposed = false
  const unsubscribe = subscribe((request) => {
    queue = queue.then(async () => {
      if (disposed) {
        return
      }
      try {
        const generation = rootGeneration()
        const result = await apply(
          request,
          () => !disposed && rootAvailable() && rootGeneration() === generation
        )
        if (!disposed) {
          respond({ id: request.id, ok: true, result: { ...result, viewerId: 0 } })
        }
      } catch (error) {
        if (!disposed) {
          respond({
            id: request.id,
            ok: false,
            error: error instanceof Error ? error.message : 'viewer_operation_failed'
          })
        }
      }
    })
  })
  return () => {
    disposed = true
    unsubscribe()
  }
}
