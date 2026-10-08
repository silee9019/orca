// @vitest-environment happy-dom
import { cookieFixture } from './browser-settings-cookie.fixture'
import { browserImportHintOwnerSocketFixture } from './browser-import-hint-owner-socket.fixture'
import { browserSessionRegistry } from '../../src/main/browser/browser-session-registry'
import { BROWSER_PROFILE_FILE_METHODS } from '../../src/main/runtime/rpc/methods/browser-profile-file'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { useAppStore } from '../../src/renderer/src/store'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { toast } from 'sonner'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('../../src/main/browser/browser-session-partition-policies', () => ({
  installBrowserSessionPartitionPolicies: () => {},
  forgetBrowserSessionPartitionPolicies: () => {},
  applyBrowserSessionUserAgent: () => {}
}))
let fixture: Awaited<ReturnType<typeof browserImportHintOwnerSocketFixture>> | undefined
afterEach(async () => {
  await fixture?.close()
  fixture = undefined
})
async function setupFileOwner() {
  fixture = await browserImportHintOwnerSocketFixture()
  cookieFixture.directory = fixture.directory
  cookieFixture.jars.clear()
  cookieFixture.wait = Promise.resolve()
  browserSessionRegistry.configureForOrcaProfile({
    orcaProfileId: 'hint-file-fixture',
    profileDirectory: fixture.directory
  })
  const dispatcher = new RpcDispatcher({
    runtime: fixture.runtime,
    methods: BROWSER_PROFILE_FILE_METHODS
  })
  Object.assign(window.api, {
    runtime: {
      call: async ({ method, params }: { method: string; params: unknown }) =>
        dispatcher.dispatch({ id: 'file-owner', method, params })
    }
  })
  Object.assign(window.api.browser, {
    sessionListProfiles: async () => browserSessionRegistry.listProfiles()
  })
  const store = fixture.store
  Object.assign(window.api.ui, {
    recordFeatureInteraction: async (id: Parameters<typeof store.recordFeatureInteraction>[0]) =>
      store.recordFeatureInteraction(id)
  })
  const file = join(fixture.directory, 'cookies.json')
  writeFileSync(file, 'private-fixture-cookie-value')
  return { owner: fixture, file }
}
it('imports an explicit cookie file through the mounted hint owner and reads its actual profile jar', async () => {
  const { owner, file } = await setupFileOwner()
  const success = vi.spyOn(toast, 'success')
  await owner.invoke('open')
  await owner.invoke('import-file', ['--file', file, '--confirm-profile', 'default'])
  const profile = browserSessionRegistry.getProfile('default')
  expect(profile?.source?.browserFamily).toBe('manual')
  if (!profile) {
    throw new Error('fixture profile missing')
  }
  expect(cookieFixture.jars.get(profile.partition)).toBe('private-fixture-cookie-value')
  expect(useAppStore.getState().browserSessionImportState?.status).toBe('success')
  expect(owner.store.getUI().featureInteractions['cookie-import']?.interactionCount).toBe(1)
  expect(owner.output.mock.calls.flat().join(' ')).not.toContain('private-fixture-cookie-value')
  expect(success).toHaveBeenCalledTimes(1)
  expect(document.querySelector('[data-import-hint-content]')).toBeNull()
})

it('rejects absent or mismatched confirmation before any provider effect', async () => {
  const { owner, file } = await setupFileOwner()
  await expect(owner.invoke('import-file', ['--file', file])).rejects.toThrow()
  await expect(
    owner.invoke('import-file', ['--file', file, '--confirm-profile', 'other'])
  ).rejects.toThrow()
  expect(cookieFixture.jars.size).toBe(0)
  expect(useAppStore.getState().browserSessionImportState).toBeNull()
})
it('waits for the provider and rejects a changed target without publishing cookie contents', async () => {
  const { owner, file } = await setupFileOwner()
  let release = (): void => {}
  cookieFixture.wait = new Promise<void>((resolve) => {
    release = resolve
  })
  const pending = owner.invoke('import-file', ['--file', file, '--confirm-profile', 'default'])
  const rejected = expect(pending).rejects.toThrow()
  await vi.waitFor(() =>
    expect(useAppStore.getState().browserSessionImportState?.status).toBe('importing')
  )
  expect(cookieFixture.jars.size).toBe(0)
  expect(owner.output).not.toHaveBeenCalled()
  await act(async () => {
    useAppStore.setState({ activeWorktreeId: 'other' })
  })
  await rejected
  await act(async () => {
    release()
  })
  await vi.waitFor(() => expect(cookieFixture.jars.size).toBe(1))
  expect(owner.output).not.toHaveBeenCalled()
})
it('rejects provider failure and omits private file paths and errors from stdout', async () => {
  const { owner } = await setupFileOwner()
  const success = vi.spyOn(toast, 'success')
  await expect(
    owner.invoke('import-file', [
      '--file',
      'private-missing-cookie-file',
      '--confirm-profile',
      'default'
    ])
  ).rejects.toThrow()
  expect(cookieFixture.jars.size).toBe(0)
  expect(success).not.toHaveBeenCalled()
  expect(owner.output).not.toHaveBeenCalled()
})
it('does not acknowledge before the existing feature interaction writer settles', async () => {
  const { owner, file } = await setupFileOwner()
  let release = (): void => {}
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  const persist = vi.fn(async (id: Parameters<typeof owner.store.recordFeatureInteraction>[0]) => {
    await wait
    return owner.store.recordFeatureInteraction(id)
  })
  Object.assign(window.api.ui, { recordFeatureInteraction: persist })
  const pending = owner.invoke('import-file', ['--file', file, '--confirm-profile', 'default'])
  await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1))
  expect(cookieFixture.jars.size).toBe(1)
  expect(owner.output).not.toHaveBeenCalled()
  await act(async () => {
    release()
  })
  await pending
  expect(owner.store.getUI().featureInteractions['cookie-import']?.interactionCount).toBe(1)
})
