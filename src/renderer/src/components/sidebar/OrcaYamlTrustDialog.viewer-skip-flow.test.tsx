// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AppState } from '@/store/types'
import { __resetTrustPromptChainForTests, ensureHooksConfirmed } from '@/lib/ensure-hooks-confirmed'
import {
  createCompatibleRuntimeStatusResponseIfNeeded,
  type RuntimeEnvironmentCallRequest
} from '@/runtime/runtime-compatibility-test-fixture'
import { clearRuntimeCompatibilityCacheForTests } from '@/runtime/runtime-rpc-client'
import {
  publishOrcaYamlTrustControl,
  publishOrcaYamlTrustView,
  readOrcaYamlTrustControl
} from '@/runtime/orca-yaml-trust-viewer-view'

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))
vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) => (
    <button {...props}>{children}</button>
  )
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
// Why: the real modal slot decides when the caller is settled and the next prompt may open.
vi.mock('@/store', async () => {
  const { useStore } = await import('zustand')
  const { createUIStore } = await import('@/store/slices/ui-slice-test-harness')
  const store = createUIStore()
  const useAppStore = Object.assign(
    <T,>(selector: (state: AppState) => T): T => useStore(store, selector),
    { getState: store.getState, setState: store.setState }
  )
  return { useAppStore }
})
import { useAppStore } from '@/store'
import OrcaYamlTrustDialog from './OrcaYamlTrustDialog'

const hooksCheck = vi.fn()
const runtimeCall = vi.fn()
const settleOrReport = <T,>(promise: Promise<T>): Promise<T | 'never-settled'> =>
  Promise.race([
    promise,
    new Promise<'never-settled'>((resolve) => setTimeout(() => resolve('never-settled'), 200))
  ])
const modalOpen = (): Promise<void> =>
  vi.waitFor(() => expect(useAppStore.getState().activeModal).toBe('confirm-orca-yaml-hooks'))

beforeEach(() => {
  vi.clearAllMocks()
  runtimeCall.mockImplementation((args: RuntimeEnvironmentCallRequest) =>
    createCompatibleRuntimeStatusResponseIfNeeded(args)
  )
  clearRuntimeCompatibilityCacheForTests()
  vi.stubGlobal('window', {
    api: {
      hooks: { check: hooksCheck, readIssueCommand: vi.fn() },
      runtimeEnvironments: { call: runtimeCall }
    }
  })
  __resetTrustPromptChainForTests()
  hooksCheck.mockResolvedValue({
    hasHooks: true,
    hooks: { scripts: { setup: 'pnpm install' } },
    mayNeedUpdate: false
  })
  useAppStore.setState(
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the test seeds only the repo fields the trust flow reads.
    {
      activeModal: 'none',
      modalData: {},
      repos: [{ id: 'repo-1', displayName: 'Repo One' }],
      trustedOrcaHooks: {}
    } as unknown as Partial<AppState>
  )
})
afterEach(() => {
  cleanup()
  publishOrcaYamlTrustView(null)
  publishOrcaYamlTrustControl(null)
  vi.unstubAllGlobals()
})

it('declines the waiting caller as skip, trusts nothing, and leaves the queue for the next prompt', async () => {
  const state = useAppStore.getState()
  const first = ensureHooksConfirmed(state, 'repo-1', 'setup')
  await modalOpen()
  render(<OrcaYamlTrustDialog />)
  const firstToken = readOrcaYamlTrustControl()?.token
  expect(firstToken).toBe(useAppStore.getState().modalData.onResolve)

  act(() => readOrcaYamlTrustControl()?.skip())
  expect(await settleOrReport(first)).toBe('skip')
  expect(useAppStore.getState().trustedOrcaHooks).toEqual({})
  expect(useAppStore.getState().activeModal).toBe('none')

  // The same script asked about again opens a prompt of its own, with a control of its own.
  const second = ensureHooksConfirmed(state, 'repo-1', 'setup')
  await modalOpen()
  const secondToken = readOrcaYamlTrustControl()?.token
  expect(secondToken).toBe(useAppStore.getState().modalData.onResolve)
  expect(secondToken).not.toBe(firstToken)
  act(() => readOrcaYamlTrustControl()?.skip())
  expect(await settleOrReport(second)).toBe('skip')
  expect(useAppStore.getState().trustedOrcaHooks).toEqual({})
})
