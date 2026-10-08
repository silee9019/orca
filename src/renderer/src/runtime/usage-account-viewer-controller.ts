import { createBrowserUuid } from '@/lib/browser-uuid'
type Provider = 'claude' | 'codex'
type SignInCallbacks = {
  signIn: () => Promise<boolean>
  cancel: () => Promise<boolean>
  busy: () => boolean
  available?: () => boolean
}
type Receipt = {
  accepted: true
  provider: Provider
  operationId: string
  status: 'pending' | 'completed' | 'failed' | 'unavailable'
  cancelRequested: boolean
}
type Slot = {
  callbacks: Set<SignInCallbacks>
  owner: SignInCallbacks | null
  receipt: Receipt | null
}
const claude: Slot = { callbacks: new Set(), owner: null, receipt: null }
const codex: Slot = { callbacks: new Set(), owner: null, receipt: null }
function slot(provider: Provider): Slot {
  return provider === 'claude' ? claude : codex
}

export function registerFeatureWallUsageAccounts(provider: Provider, callbacks: SignInCallbacks) {
  const current = slot(provider)
  current.callbacks.add(callbacks)
  return () => {
    current.callbacks.delete(callbacks)
    if (current.owner === callbacks && current.receipt) {
      current.receipt.status = 'unavailable'
    }
  }
}

export function startFeatureWallUsageSignIn(provider: Provider): Receipt {
  const current = slot(provider)
  if (current.callbacks.size > 1) {
    throw new Error('usage_signin_ambiguous')
  }
  const callbacks = [...current.callbacks][0]
  if (!callbacks || callbacks.available?.() === false) {
    throw new Error('usage_signin_unavailable')
  }
  if (current.receipt?.status === 'pending' || callbacks.busy()) {
    throw new Error('usage_signin_busy')
  }
  const receipt: Receipt = {
    accepted: true,
    provider,
    operationId: createBrowserUuid(),
    status: 'pending',
    cancelRequested: false
  }
  current.receipt = receipt
  current.owner = callbacks
  const complete = (success: boolean) => {
    if (current.callbacks.has(callbacks) && current.receipt === receipt) {
      receipt.status = success ? 'completed' : 'failed'
    }
  }
  try {
    void callbacks.signIn().then(complete, () => complete(false))
  } catch {
    complete(false)
  }
  return { ...receipt }
}

export function readFeatureWallUsageSignIn(provider: Provider, operationId: string): Receipt {
  const receipt = slot(provider).receipt
  if (!receipt || receipt.operationId !== operationId) {
    throw new Error('usage_signin_unavailable')
  }
  return { ...receipt }
}

export async function cancelFeatureWallUsageSignIn(provider: Provider, operationId: string) {
  const current = slot(provider)
  const receipt = readFeatureWallUsageSignIn(provider, operationId)
  if (receipt.status !== 'pending') {
    return receipt
  }
  const callbacks = current.owner
  if (!callbacks || !current.callbacks.has(callbacks)) {
    throw new Error('usage_signin_unavailable')
  }
  let requested: boolean
  try {
    requested = await callbacks.cancel()
  } catch {
    throw new Error('usage_signin_cancel_failed')
  }
  if (!current.callbacks.has(callbacks) || current.receipt?.operationId !== operationId) {
    throw new Error('usage_signin_unavailable')
  }
  current.receipt.cancelRequested = requested
  return { ...current.receipt }
}

const refreshAccountState = new Set<() => void | Promise<void>>()
export function registerUsageAccountStateRefresh(callback: () => void | Promise<void>) {
  const owner = () => callback()
  refreshAccountState.add(owner)
  return () => {
    refreshAccountState.delete(owner)
  }
}
export async function refreshUsageAccountStateViaViewer() {
  if (refreshAccountState.size > 1) {
    throw new Error('usage_account_refresh_ambiguous')
  }
  const callback = [...refreshAccountState][0]
  if (!callback) {
    throw new Error('usage_account_refresh_unavailable')
  }
  try {
    await callback()
  } catch {
    throw new Error('usage_account_refresh_failed')
  }
  if (!refreshAccountState.has(callback)) {
    throw new Error('usage_account_refresh_unavailable')
  }
  return { callbackCompleted: true }
}
