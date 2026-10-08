import { expect, it } from 'vitest'
import { BitbucketConnect } from './bitbucket-params'
it('requires the credentials for the selected authentication mode and rejects credentials in the API URL', () => {
  expect(BitbucketConnect.safeParse({ authMode: 'token' }).success).toBe(false)
  expect(
    BitbucketConnect.safeParse({ authMode: 'basic', email: 'fixture@example.invalid' }).success
  ).toBe(false)
  expect(BitbucketConnect.safeParse({ authMode: 'token', accessToken: 'fixture' }).success).toBe(
    true
  )
  expect(
    BitbucketConnect.safeParse({ authMode: 'token', accessToken: 'fixture', baseUrl: 'invalid' })
      .success
  ).toBe(false)
  expect(
    BitbucketConnect.safeParse({
      authMode: 'token',
      accessToken: 'fixture',
      baseUrl: 'https://user:password@example.invalid'
    }).success
  ).toBe(false)
})
