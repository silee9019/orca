// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const rateLimits: Record<string, unknown> = { claude: null, codex: null }
  return {
    claudeList: vi.fn(),
    codexList: vi.fn(),
    fetchSettings: vi.fn(async () => {}),
    rateLimits
  }
})

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      fetchSettings: mocks.fetchSettings,
      fetchRateLimits: async () => {},
      rateLimits: mocks.rateLimits
    })
}))

import {
  startFeatureWallUsageSignIn,
  readFeatureWallUsageSignIn,
  cancelFeatureWallUsageSignIn
} from '@/runtime/usage-account-viewer-controller'
import { toast } from 'sonner'
import { UsageAccountsCard } from './UsageAccountsCard'

const EMPTY_ACCOUNTS = { accounts: [], activeAccountId: null }
const UNKNOWN_TEXT = 'Account status unknown'
const NOT_SET_UP_TEXT = 'Tracking not set up'

let container: HTMLDivElement
let root: Root

async function renderCard(onAccountStateChange?: () => Promise<void>, copies = 1): Promise<void> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <>
        {Array.from({ length: copies }, (_, index) => (
          <UsageAccountsCard key={index} onAccountStateChange={onAccountStateChange} />
        ))}
      </>
    )
  })
}

describe('UsageAccountsCard account-list failures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rateLimits = { claude: null, codex: null }
    Object.assign(window, {
      api: {
        claudeAccounts: { list: mocks.claudeList, add: vi.fn() },
        codexAccounts: { list: mocks.codexList, add: vi.fn() }
      }
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('keeps duplicate mounted cards usable while refusing an ambiguous sign-in', async () => {
    mocks.claudeList.mockResolvedValue(EMPTY_ACCOUNTS)
    mocks.codexList.mockResolvedValue(EMPTY_ACCOUNTS)
    await renderCard(undefined, 2)
    expect(() => startFeatureWallUsageSignIn('claude')).toThrow('ambiguous')
    await act(async () => {
      root.render(
        <>
          <UsageAccountsCard key={0} />
        </>
      )
    })
    Object.assign(window.api.claudeAccounts, { add: vi.fn(async () => EMPTY_ACCOUNTS) })
    let operationId = ''
    await act(async () => {
      operationId = startFeatureWallUsageSignIn('claude').operationId
      await Promise.resolve()
    })
    expect(readFeatureWallUsageSignIn('claude', operationId).status).toBe('completed')
  })

  it('finishes the original mounted sign-in only after settings, callback, toast and idle', async () => {
    mocks.claudeList.mockResolvedValue(EMPTY_ACCOUNTS)
    mocks.codexList.mockResolvedValue(EMPTY_ACCOUNTS)
    let finish: (value: typeof EMPTY_ACCOUNTS) => void = () => {}
    const add = vi.fn(
      () =>
        new Promise<typeof EMPTY_ACCOUNTS>((resolve) => {
          finish = resolve
        })
    )
    const cancel = vi.fn(async () => true)
    Object.assign(window.api.claudeAccounts, { add, cancelPendingLogin: cancel })
    const changed = vi.fn(async () => {})
    await renderCard(changed)
    let receipt: ReturnType<typeof startFeatureWallUsageSignIn> = {
      accepted: true,
      provider: 'claude',
      operationId: '',
      status: 'pending',
      cancelRequested: false
    }
    act(() => {
      receipt = { ...receipt, ...startFeatureWallUsageSignIn('claude'), status: 'pending' }
    })
    expect(container.textContent).toContain('Signing in')
    expect(changed).not.toHaveBeenCalled()
    await act(async () => {
      await cancelFeatureWallUsageSignIn('claude', receipt.operationId)
    })
    expect(readFeatureWallUsageSignIn('claude', receipt.operationId).status).toBe('pending')
    await act(async () => {
      finish(EMPTY_ACCOUNTS)
      await Promise.resolve()
    })
    expect(mocks.fetchSettings).toHaveBeenCalledOnce()
    expect(changed).toHaveBeenCalledOnce()
    expect(toast.success).toHaveBeenCalled()
    expect(container.textContent).not.toContain('Signing in')
    expect(readFeatureWallUsageSignIn('claude', receipt.operationId).status).toBe('completed')
  })

  it('stops asserting "Tracking not set up" for a provider whose list never loaded', async () => {
    mocks.claudeList.mockRejectedValue(new Error('offline'))
    mocks.codexList.mockResolvedValue(EMPTY_ACCOUNTS)

    await renderCard()

    const pills = Array.from(container.querySelectorAll('span')).map((node) => node.textContent)
    expect(pills).toContain(UNKNOWN_TEXT)
    // Why: only the failing provider goes unknown — Codex genuinely answered "none".
    expect(pills).toContain(NOT_SET_UP_TEXT)
  })

  it('keeps the real label when the list resolves empty', async () => {
    mocks.claudeList.mockResolvedValue(EMPTY_ACCOUNTS)
    mocks.codexList.mockResolvedValue(EMPTY_ACCOUNTS)

    await renderCard()

    expect(container.textContent).not.toContain(UNKNOWN_TEXT)
    expect(container.textContent).toContain(NOT_SET_UP_TEXT)
  })

  it('prefers the observed connection when rate limits already prove tracking is on', async () => {
    mocks.claudeList.mockRejectedValue(new Error('offline'))
    mocks.codexList.mockResolvedValue(EMPTY_ACCOUNTS)
    mocks.rateLimits = { claude: { status: 'ok', session: null, weekly: null }, codex: null }

    await renderCard()

    expect(container.textContent).not.toContain(UNKNOWN_TEXT)
    expect(container.textContent).toContain('Connected · System default')
  })

  it('does not claim tracking is unset while the account read is pending', async () => {
    let rejectClaude: (reason: Error) => void = () => {}
    mocks.claudeList.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectClaude = reject
      })
    )
    mocks.codexList.mockResolvedValue(EMPTY_ACCOUNTS)

    await renderCard()

    expect(container.textContent).toContain(UNKNOWN_TEXT)
    expect(container.textContent).toContain(NOT_SET_UP_TEXT)

    await act(async () => {
      rejectClaude(new Error('offline'))
      await Promise.resolve()
    })

    expect(container.textContent).toContain(UNKNOWN_TEXT)
  })
})
