// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('@/store', () => ({
  useAppStore: (select: (state: { settings: { activeRuntimeEnvironmentId: null } }) => unknown) =>
    select({ settings: { activeRuntimeEnvironmentId: null } })
}))
import { useOrcaYamlTrustViewerPublication } from './use-orca-yaml-trust-viewer-publication'
import {
  publishOrcaYamlTrustControl,
  publishOrcaYamlTrustView,
  readOrcaYamlTrustControl,
  readOrcaYamlTrustView
} from './orca-yaml-trust-viewer-view'

type PublicationArgs = Parameters<typeof useOrcaYamlTrustViewerPublication>[0]
const prompt = {
  repoId: 'repo-1',
  repoName: 'orca',
  scriptKind: 'setup',
  previouslyApproved: false,
  contentHash: 'hash-1'
}

afterEach(() => {
  cleanup()
  publishOrcaYamlTrustView(null)
  publishOrcaYamlTrustControl(null)
})

it('publishes the prompt with the latest skip and token, and withdraws both on unmount', () => {
  const first = vi.fn()
  const firstToken = () => undefined
  const hook = renderHook<void, PublicationArgs>(
    (props) => useOrcaYamlTrustViewerPublication(props),
    { initialProps: { open: true, prompt, skip: first, token: firstToken } }
  )
  expect(readOrcaYamlTrustView()).toEqual({
    runtimeContextKey: expect.any(String),
    open: true,
    prompt
  })
  expect(readOrcaYamlTrustControl()?.token).toBe(firstToken)
  readOrcaYamlTrustControl()?.skip()
  expect(first).toHaveBeenCalledOnce()
  const second = vi.fn()
  const secondToken = () => undefined
  hook.rerender({
    open: true,
    prompt: { ...prompt, scriptKind: 'archive', contentHash: 'hash-2' },
    skip: second,
    token: secondToken
  })
  expect(readOrcaYamlTrustView()).toMatchObject({
    prompt: { scriptKind: 'archive', contentHash: 'hash-2' }
  })
  expect(readOrcaYamlTrustControl()?.token).toBe(secondToken)
  readOrcaYamlTrustControl()?.skip()
  expect(second).toHaveBeenCalledOnce()
  hook.rerender({ open: false, prompt, skip: second, token: secondToken })
  expect(readOrcaYamlTrustView()).toMatchObject({ open: false })
  expect(readOrcaYamlTrustControl()).toBeNull()
  hook.unmount()
  expect(readOrcaYamlTrustView()).toBeNull()
  expect(readOrcaYamlTrustControl()).toBeNull()
})
