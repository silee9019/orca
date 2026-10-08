import { describe, expect, it, vi } from 'vitest'

const connect = vi.hoisted(() => vi.fn())
vi.mock('./profile-cloud-service', () => ({ connectCurrentOrcaProfile: connect }))
import { ProfileCliAuth } from './profile-cli-auth'

describe('CLI profile authentication lifecycle', () => {
  it('keeps one pending flow, publishes its URL and cancels only its exact operation', async () => {
    connect.mockImplementation(async (_path, options) => {
      await options.authorize('https://fixture.invalid/authorize?state=fixture')
      if (options.signal.aborted) {
        return { status: 'cancelled', auth: {} }
      }
      return new Promise((resolve) =>
        options.signal.addEventListener('abort', () => resolve({ status: 'cancelled', auth: {} }), {
          once: true
        })
      )
    })
    const auth = new ProfileCliAuth()
    const operation = auth.start('/isolated-profile', 'fixture-profile')
    expect(auth.status(operation.operationId).authorizationUrl).toContain('fixture.invalid')
    expect(() => auth.start('/other', 'other')).toThrow('already pending')
    expect(() => auth.cancel('wrong-operation')).toThrow('not found')
    auth.cancel(operation.operationId)
    await vi.waitFor(() => expect(auth.status(operation.operationId).status).toBe('cancelled'))
    expect(auth.status(operation.operationId).authorizationUrl).toBeUndefined()
  })

  it('notifies the existing auth consumer on completion and removes provider errors from output', async () => {
    const changed = vi.fn()
    connect.mockResolvedValueOnce({ status: 'connected', auth: {} })
    const auth = new ProfileCliAuth(changed)
    const first = auth.start('/isolated-profile', 'fixture-profile')
    await vi.waitFor(() => expect(auth.status(first.operationId).status).toBe('complete'))
    expect(changed).toHaveBeenCalledOnce()
    connect.mockResolvedValueOnce({
      status: 'failed',
      auth: {},
      error: 'sensitive-provider-response'
    })
    const second = auth.start('/isolated-profile', 'fixture-profile')
    await vi.waitFor(() => expect(auth.status(second.operationId).status).toBe('failed'))
    expect(JSON.stringify(auth.status(second.operationId))).not.toContain(
      'sensitive-provider-response'
    )
  })
})
