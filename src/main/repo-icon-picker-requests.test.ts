import { afterEach, expect, it, vi } from 'vitest'
import { RepoIconPickerRequests } from './repo-icon-picker-requests'
const image = { dataUrl: 'data:image/png;base64,aGVsbG8=', fileName: 'fixture.png' }
let requests: RepoIconPickerRequests | null = null
afterEach(() => {
  requests?.dispose()
  requests = null
  vi.restoreAllMocks()
})
it('keeps an active cancelled dialog pending until its native promise settles', async () => {
  let settle: ((selected: typeof image | null) => void) | undefined
  const pick = vi.fn(
    () =>
      new Promise<typeof image | null>((resolve) => {
        settle = resolve
      })
  )
  requests = new RepoIconPickerRequests(pick)
  const started = requests.start()
  expect(started.state).toBe('pending')
  await vi.waitFor(() => expect(pick).toHaveBeenCalledOnce())
  expect(() => requests!.start()).toThrow(/already pending/)
  expect(requests.cancel(started.requestId).state).toBe('cancel_requested')
  expect(requests.status(started.requestId).humanAction).toBe('close-native-picker')
  expect(() => requests!.start()).toThrow(/already pending/)
  if (!settle) {
    throw new Error('Missing fixture resolver')
  }
  settle(image)
  await vi.waitFor(() => expect(requests!.status(started.requestId).state).toBe('cancelled'))
  expect(() => requests!.result(started.requestId)).toThrow(/completed image/)
})
it('retains at most eight terminal results and expires them after fifteen minutes', async () => {
  requests = new RepoIconPickerRequests(async () => image)
  let first = ''
  for (let index = 0; index < 9; index++) {
    const started = requests.start()
    if (index === 0) {
      first = started.requestId
    }
    await vi.waitFor(() => expect(requests!.status(started.requestId).state).toBe('completed'))
  }
  expect(() => requests!.status(first)).toThrow('selector_not_found')
  const started = requests.start()
  await vi.waitFor(() => expect(requests!.status(started.requestId).state).toBe('completed'))
  expect(requests.result(started.requestId)).toEqual(image)
  const now = Date.now()
  vi.spyOn(Date, 'now').mockReturnValue(now + 16 * 60 * 1000)
  expect(() => requests!.status(started.requestId)).toThrow('selector_not_found')
})
it('turns picker errors into a fixed failed state and cancellation discards completed bytes', async () => {
  requests = new RepoIconPickerRequests(async () => {
    throw new Error('private-selection-canary')
  })
  const failed = requests.start()
  await vi.waitFor(() => expect(requests!.status(failed.requestId).state).toBe('failed'))
  expect(JSON.stringify(requests.status(failed.requestId))).not.toContain(
    'private-selection-canary'
  )
  requests.dispose()
  requests = new RepoIconPickerRequests(async () => image)
  const completed = requests.start()
  await vi.waitFor(() => expect(requests!.status(completed.requestId).state).toBe('completed'))
  expect(requests.cancel(completed.requestId).state).toBe('cancelled')
  expect(() => requests!.result(completed.requestId)).toThrow(/completed image/)
})
