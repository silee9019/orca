import { expect, it } from 'vitest'
import { COMMAND_SPECS } from '../../src/cli/specs'
it('registers the finite read-only listener count command', () => {
  expect(COMMAND_SPECS.some((spec) => spec.path.join(' ') === 'terminal data-listener-count')).toBe(
    true
  )
})

import {
  TerminalListenerCountParams,
  TerminalListenerCountReceipt
} from '../../src/shared/rpc-contract/terminal-listener-count-params'
const params = {
  expectedRuntimeId: 'fixture',
  executionHostId: 'local',
  expectedRendererId: 421,
  timeoutMs: 1000
}
it.each([
  { executionHostId: 'ssh:fixture' },
  { expectedRendererId: 0 },
  { timeoutMs: 10001 },
  { timeoutMs: 0 },
  { extra: true }
])('refuses invalid listener query parameters: %j', (change) => {
  expect(TerminalListenerCountParams.safeParse({ ...params, ...change }).success).toBe(false)
})
it.each([
  { count: -1 },
  { count: 1.5 },
  { ptyDeliveryVerified: true },
  { source: 'main-cache' },
  { privateData: 'fixture' }
])('refuses unsupported listener count receipts: %j', (change) => {
  expect(
    TerminalListenerCountReceipt.safeParse({
      expectedRuntimeId: 'fixture',
      executionHostId: 'local',
      rendererId: 421,
      count: 2,
      source: 'preload-pty-data-listeners',
      ptyDeliveryVerified: false,
      ...change
    }).success
  ).toBe(false)
})
