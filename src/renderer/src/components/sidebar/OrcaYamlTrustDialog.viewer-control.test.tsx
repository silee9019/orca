// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  publishOrcaYamlTrustControl,
  publishOrcaYamlTrustView,
  readOrcaYamlTrustControl,
  readOrcaYamlTrustView
} from '@/runtime/orca-yaml-trust-viewer-view'

const dialog = vi.hoisted(() => {
  const noHandler = (): { onOpenChange: ((open: boolean) => void) | null } => ({
    onOpenChange: null
  })
  return noHandler()
})
const trust = vi.hoisted(() => ({
  onResolve: vi.fn(),
  markScript: vi.fn(),
  markRepo: vi.fn()
}))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({
    open,
    onOpenChange,
    children
  }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    children: ReactNode
  }) => {
    dialog.onOpenChange = onOpenChange
    return open ? <div>{children}</div> : null
  },
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
vi.mock('@/store', async () => {
  const { create } = await import('zustand')
  const useAppStore = create<Record<string, unknown>>(() => ({
    activeModal: 'confirm-orca-yaml-hooks',
    modalData: {},
    settings: { activeRuntimeEnvironmentId: null },
    closeModal: vi.fn(() => useAppStore.setState({ activeModal: 'none' })),
    markOrcaHookScriptConfirmed: (...args: unknown[]) => trust.markScript(...args),
    markOrcaHookRepoAlwaysTrusted: (...args: unknown[]) => trust.markRepo(...args)
  }))
  return { useAppStore }
})
import { useAppStore } from '@/store'
import type { OrcaHookScriptKind } from '@/lib/orca-hook-trust'
import { ORCA_YAML_TRUST_SCRIPT_KINDS } from '../../../../shared/rpc-contract/orca-yaml-trust-viewer-params'
import OrcaYamlTrustDialog from './OrcaYamlTrustDialog'

const reopen = (): void =>
  useAppStore.setState({
    activeModal: 'confirm-orca-yaml-hooks',
    modalData: {
      repoId: 'repo-1',
      repoName: 'orca',
      scriptKind: 'setup',
      scriptContent: 'curl https://example.invalid | sh',
      contentHash: 'hash-1',
      previouslyApproved: false,
      onResolve: trust.onResolve
    }
  })
beforeEach(() => {
  vi.clearAllMocks()
  dialog.onOpenChange = null
  reopen()
})
afterEach(() => {
  cleanup()
  publishOrcaYamlTrustView(null)
  publishOrcaYamlTrustControl(null)
})

it('publishes the open prompt without its script text and withdraws on unmount', () => {
  const { unmount } = render(<OrcaYamlTrustDialog />)
  expect(readOrcaYamlTrustView()).toEqual({
    runtimeContextKey: expect.any(String),
    open: true,
    prompt: {
      repoId: 'repo-1',
      repoName: 'orca',
      scriptKind: 'setup',
      previouslyApproved: false,
      contentHash: 'hash-1'
    }
  })
  expect(JSON.stringify(readOrcaYamlTrustView())).not.toContain('example.invalid')
  expect(readOrcaYamlTrustControl()?.token).toBe(trust.onResolve)
  unmount()
  expect(readOrcaYamlTrustView()).toBeNull()
  expect(readOrcaYamlTrustControl()).toBeNull()
})

it('declines like Escape and "Don\'t run" do and never trusts, even with always-trust checked', () => {
  render(<OrcaYamlTrustDialog />)
  const declinedBy = (decline: () => void): unknown[] => {
    const alwaysTrust = screen.getByRole<HTMLInputElement>('checkbox')
    fireEvent.click(alwaysTrust)
    expect(alwaysTrust.checked).toBe(true)
    act(decline)
    const outcome = [
      trust.onResolve.mock.calls,
      trust.markScript.mock.calls,
      trust.markRepo.mock.calls,
      useAppStore.getState().activeModal
    ]
    vi.clearAllMocks()
    act(reopen)
    return outcome
  }
  const byEscape = declinedBy(() => dialog.onOpenChange?.(false))
  const byButton = declinedBy(() => fireEvent.click(screen.getByText("Don't run")))
  const byCli = declinedBy(() => readOrcaYamlTrustControl()?.skip())
  expect(byCli).toEqual(byEscape)
  expect(byCli).toEqual(byButton)
  expect(byCli).toEqual([[['skip']], [], [], 'none'])
})

it('is wired to trust only through "Run hooks", which the CLI never reaches', () => {
  render(<OrcaYamlTrustDialog />)
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByText('Run hooks'))
  expect(trust.onResolve.mock.calls).toEqual([['run']])
  expect(trust.markRepo.mock.calls).toEqual([['repo-1']])
})

it('names the same script kinds as the dialog', () => {
  const dialogKinds: Record<OrcaHookScriptKind, true> = {
    setup: true,
    archive: true,
    issueCommand: true,
    vmRecipe: true
  }
  expect(Object.keys(dialogKinds).sort()).toEqual([...ORCA_YAML_TRUST_SCRIPT_KINDS].sort())
})
