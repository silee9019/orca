import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  bumpProviderRuntimeSessionGeneration,
  getProviderRuntimeContextKey
} from '@/lib/provider-runtime-context'
import type { OrcaYamlTrustControl } from './orca-yaml-trust-viewer-view'

type Prompt = {
  repoId: string
  repoName: string
  scriptKind: string
  previouslyApproved: boolean
  contentHash: string
}
const fixture = vi.hoisted(() => {
  const noControl = (): OrcaYamlTrustControl | null => null
  const noPrompt = (): Prompt | null => null
  const noRuntimeEnvironment = (): string | null => null
  const noOpen = (): boolean => true
  const noSettle = (): (() => void) => () => undefined
  return {
    state: {
      settings: { activeRuntimeEnvironmentId: noRuntimeEnvironment() },
      persistedUIReady: true,
      activeModal: 'confirm-orca-yaml-hooks',
      modalData: { onResolve: noSettle() }
    },
    viewKey: noRuntimeEnvironment(),
    open: noOpen(),
    prompt: noPrompt(),
    control: noControl()
  }
})
vi.mock('@/store', () => ({ useAppStore: { getState: () => fixture.state } }))
vi.mock('./orca-yaml-trust-viewer-view', () => ({
  readOrcaYamlTrustView: () =>
    fixture.prompt
      ? {
          runtimeContextKey:
            fixture.viewKey ?? getProviderRuntimeContextKey(fixture.state.settings),
          open: fixture.open,
          prompt: fixture.prompt
        }
      : null,
  readOrcaYamlTrustControl: () => (fixture.prompt && fixture.open ? fixture.control : null)
}))
import { applyOrcaYamlTrustRequest } from './orca-yaml-trust-viewer-bridge'
import type { OrcaYamlTrustViewerCommand } from '../../../shared/rpc-contract/orca-yaml-trust-viewer-params'

const host = { viewer: 'host' } as const
const request = (command: OrcaYamlTrustViewerCommand, validForMs = 9000) => ({
  id: 'r',
  expiresAt: Date.now() + validForMs,
  command
})
const setup: Prompt = {
  repoId: 'repo-1',
  repoName: 'orca',
  scriptKind: 'setup',
  previouslyApproved: false,
  contentHash: 'hash-1'
}
// The caller's settle function: unique per prompt, held by both the modal data and the published control.
const settleFunction = (): (() => void) => () => undefined
// Mirrors the dialog: declining closes the prompt at once, and the next prompt (if any) opens after it.
const skipControl = (next?: { prompt: Prompt; token: () => void }): OrcaYamlTrustControl => ({
  token: fixture.state.modalData.onResolve,
  skip: vi.fn(() => {
    fixture.prompt = null
    if (next) {
      fixture.prompt = next.prompt
      fixture.state.modalData = { onResolve: next.token }
      fixture.control = { token: next.token, skip: vi.fn() }
    }
  })
})
afterEach(() => {
  vi.useRealTimers()
})
beforeEach(() => {
  Object.assign(fixture.state, {
    settings: { activeRuntimeEnvironmentId: null },
    persistedUIReady: true,
    activeModal: 'confirm-orca-yaml-hooks',
    modalData: { onResolve: settleFunction() }
  })
  Object.assign(fixture, { prompt: setup, open: true, viewKey: null, control: skipControl() })
})

it('reads the open prompt without touching it, and reports none when no dialog is mounted', async () => {
  expect(await applyOrcaYamlTrustRequest(request({ ...host, operation: 'get' }))).toEqual({
    viewer: 'host',
    dispatched: false,
    applied: true,
    writeOutcome: 'not_requested',
    decision: null,
    prompt: setup,
    open: true,
    rendered: { runtimeContextKey: expect.any(String), open: true, prompt: setup }
  })
  expect(fixture.control?.skip).not.toHaveBeenCalled()
  fixture.prompt = null
  expect(await applyOrcaYamlTrustRequest(request({ ...host, operation: 'get' }))).toMatchObject({
    applied: true,
    prompt: null,
    open: false,
    rendered: { open: false, prompt: null }
  })
})
it('declines the open prompt through the published control and reports what it told the caller', async () => {
  const result = await applyOrcaYamlTrustRequest(request({ ...host, operation: 'skip' }))
  expect(fixture.control?.skip).toHaveBeenCalledOnce()
  expect(result).toMatchObject({
    dispatched: true,
    applied: true,
    writeOutcome: 'not_requested',
    decision: 'skip',
    prompt: setup,
    open: false
  })
  expect(result.reason).toBeUndefined()
})
it('skips only the prompt it was asked about', async () => {
  const guarded = { ...host, operation: 'skip', repoId: 'repo-1', scriptKind: 'setup' } as const
  expect(await applyOrcaYamlTrustRequest(request(guarded))).toMatchObject({ applied: true })
  for (const command of [
    { ...host, operation: 'skip', repoId: 'repo-2' },
    { ...host, operation: 'skip', scriptKind: 'archive' }
  ] as const) {
    fixture.prompt = setup
    fixture.control = skipControl()
    await expect(applyOrcaYamlTrustRequest(request(command))).rejects.toThrow(
      'orca_yaml_trust_mismatch'
    )
    expect(fixture.control.skip).not.toHaveBeenCalled()
  }
})
it('refuses to skip when no prompt is open, the control is not mounted, or another modal is active', async () => {
  fixture.prompt = null
  await expect(applyOrcaYamlTrustRequest(request({ ...host, operation: 'skip' }))).rejects.toThrow(
    'orca_yaml_trust_unavailable'
  )
  fixture.prompt = setup
  fixture.control = null
  await expect(applyOrcaYamlTrustRequest(request({ ...host, operation: 'skip' }))).rejects.toThrow(
    'orca_yaml_trust_unavailable'
  )
  fixture.control = skipControl()
  fixture.state.activeModal = 'settings'
  await expect(applyOrcaYamlTrustRequest(request({ ...host, operation: 'skip' }))).rejects.toThrow(
    'orca_yaml_trust_unavailable'
  )
  expect(fixture.control.skip).not.toHaveBeenCalled()
})
it('refuses a control that is not the active modal prompt, which would close the wrong one', async () => {
  fixture.state.modalData = { onResolve: settleFunction() }
  await expect(applyOrcaYamlTrustRequest(request({ ...host, operation: 'skip' }))).rejects.toThrow(
    'orca_yaml_trust_unavailable'
  )
  expect(fixture.control?.skip).not.toHaveBeenCalled()
})
it('ignores a prompt published under another runtime or while the dialog is not open', async () => {
  fixture.viewKey = 'other#9'
  expect(await applyOrcaYamlTrustRequest(request({ ...host, operation: 'get' }))).toMatchObject({
    prompt: null,
    open: false
  })
  await expect(applyOrcaYamlTrustRequest(request({ ...host, operation: 'skip' }))).rejects.toThrow(
    'orca_yaml_trust_unavailable'
  )
  fixture.viewKey = null
  fixture.open = false
  await expect(applyOrcaYamlTrustRequest(request({ ...host, operation: 'skip' }))).rejects.toThrow(
    'orca_yaml_trust_unavailable'
  )
  expect(fixture.control?.skip).not.toHaveBeenCalled()
})
it('reports a prompt that stays open as not applied', async () => {
  fixture.control = { skip: vi.fn(), token: fixture.state.modalData.onResolve }
  vi.useFakeTimers()
  const pending = applyOrcaYamlTrustRequest(request({ ...host, operation: 'skip' }, 700))
  await vi.advanceTimersByTimeAsync(700)
  expect(await pending).toMatchObject({
    dispatched: true,
    applied: false,
    open: true,
    reason: 'orca_yaml_trust_still_open'
  })
})
it('treats the next prompt taking its place as the declined prompt closing, even for the same script', async () => {
  // A different repository, a different script kind, or the very same script asked about again.
  for (const change of [{ repoId: 'repo-2' }, { scriptKind: 'archive' }, {}]) {
    const next: Prompt = { ...setup, ...change }
    fixture.prompt = setup
    fixture.state.modalData = { onResolve: settleFunction() }
    fixture.control = skipControl({ prompt: next, token: settleFunction() })
    expect(await applyOrcaYamlTrustRequest(request({ ...host, operation: 'skip' }))).toMatchObject({
      applied: true,
      prompt: setup,
      open: true,
      rendered: { prompt: next }
    })
  }
})
it('fences the runtime: not ready, other runtime, and a runtime that changes during the call', async () => {
  fixture.state.persistedUIReady = false
  await expect(applyOrcaYamlTrustRequest(request({ ...host, operation: 'get' }))).rejects.toThrow(
    'viewer_not_ready'
  )
  fixture.state.persistedUIReady = true
  fixture.state.settings = { activeRuntimeEnvironmentId: 'remote' }
  await expect(applyOrcaYamlTrustRequest(request({ ...host, operation: 'get' }))).rejects.toThrow(
    'viewer_runtime_mismatch'
  )
  fixture.state.settings = { activeRuntimeEnvironmentId: null }
  fixture.control = {
    token: fixture.state.modalData.onResolve,
    skip: vi.fn(() => {
      fixture.prompt = null
      bumpProviderRuntimeSessionGeneration()
    })
  }
  expect(await applyOrcaYamlTrustRequest(request({ ...host, operation: 'skip' }))).toMatchObject({
    applied: false,
    rendered: null,
    reason: 'viewer_runtime_changed'
  })
})
it('rejects an expired request without touching the prompt', async () => {
  await expect(
    applyOrcaYamlTrustRequest({ ...request({ ...host, operation: 'skip' }), expiresAt: 1 })
  ).rejects.toThrow('request_expired')
  expect(fixture.control?.skip).not.toHaveBeenCalled()
})
