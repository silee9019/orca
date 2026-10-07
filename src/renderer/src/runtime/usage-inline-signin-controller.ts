import { createBrowserUuid } from '@/lib/browser-uuid'
import type { CodexStatusRuntimeTarget } from '../components/status-bar/status-bar-runtime-targets'
type Target = { accountId: string; target: CodexStatusRuntimeTarget }
type Callbacks = Target & {
  signIn: () => Promise<boolean>
  pointerDown: () => void
  busy: () => boolean
  cancel: () => Promise<boolean>
}
type Receipt = {
  accepted: true
  operationId: string
  status: 'pending' | 'completed' | 'failed' | 'unavailable'
  cancelRequested: boolean
}
const mounted = new Set<Callbacks>()
let operation: { owner: Callbacks; receipt: Receipt } | null = null
function same(left: Target, right: Target) {
  return (
    left.accountId === right.accountId &&
    left.target.runtime === right.target.runtime &&
    left.target.wslDistro === right.target.wslDistro
  )
}
export function registerInlineUsageSignIn(callbacks: Callbacks) {
  mounted.add(callbacks)
  return () => {
    mounted.delete(callbacks)
    if (operation?.owner === callbacks) {
      operation.receipt.status = 'unavailable'
    }
  }
}
export function startInlineUsageSignIn(target: Target) {
  const matches = [...mounted].filter((callback) => same(callback, target))
  const owner = matches[0]
  if (matches.length !== 1 || !owner) {
    throw new Error('usage_inline_signin_unavailable')
  }
  if (operation?.receipt.status === 'pending' || owner.busy()) {
    throw new Error('usage_signin_busy')
  }
  const receipt: Receipt = {
    accepted: true,
    operationId: createBrowserUuid(),
    status: 'pending',
    cancelRequested: false
  }
  operation = { owner, receipt }
  owner.pointerDown()
  const complete = (success: boolean) => {
    if (mounted.has(owner) && operation?.receipt === receipt) {
      receipt.status = success ? 'completed' : 'failed'
    }
  }
  try {
    void owner.signIn().then(complete, () => complete(false))
  } catch {
    complete(false)
  }
  return { ...receipt }
}
export function readInlineUsageSignIn(operationId: string) {
  if (operation?.receipt.operationId !== operationId) {
    throw new Error('usage_inline_signin_unavailable')
  }
  return { ...operation.receipt }
}
export async function cancelInlineUsageSignIn(operationId: string) {
  const receipt = readInlineUsageSignIn(operationId)
  const owner = operation?.owner
  if (receipt.status !== 'pending') {
    return receipt
  }
  if (!owner || !mounted.has(owner)) {
    throw new Error('usage_inline_signin_unavailable')
  }
  let requested: boolean
  try {
    requested = await owner.cancel()
  } catch {
    throw new Error('usage_signin_cancel_failed')
  }
  if (!mounted.has(owner) || operation?.receipt.operationId !== operationId) {
    throw new Error('usage_inline_signin_unavailable')
  }
  operation.receipt.cancelRequested = requested
  return { ...operation.receipt }
}
