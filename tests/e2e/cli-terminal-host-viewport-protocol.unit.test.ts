import { expect, it } from 'vitest'
import {
  TerminalHostViewportParams,
  TerminalHostViewportReceipt
} from '../../src/shared/rpc-contract/terminal-host-viewport-params'
const params = {
  terminal: 'terminal-fixture',
  expectedPtyId: 'pty-fixture',
  expectedIncarnationId: 'incarnation-fixture',
  expectedExecutionHostId: 'local',
  expectedRendererId: 421,
  cols: 100,
  rows: 30,
  confirm: true
}
it.each([
  { expectedRendererId: 0 },
  { expectedRendererId: 1.5 },
  { cols: 1001 },
  { rows: 0 },
  { confirm: false },
  { untrusted: true }
])('rejects invalid viewport parameters: %j', (change) => {
  expect(TerminalHostViewportParams.safeParse({ ...params, ...change }).success).toBe(false)
})
it('accepts a pinned explicit claim', () => {
  expect(TerminalHostViewportParams.safeParse(params).success).toBe(true)
})
const receipt = {
  ptyId: 'pty-fixture',
  executionHostId: 'local',
  rendererId: 421,
  requested: { cols: 100, rows: 30 },
  canonicalClaimAccepted: true,
  hostResizeEligible: true,
  rendererApplied: false,
  viewportGeometryVerified: false
}
it.each([
  { rendererApplied: true },
  { viewportGeometryVerified: true },
  { canonicalClaimAccepted: false },
  { requested: { cols: 100, rows: 30, applied: true } }
])('rejects unsupported application claims: %j', (change) => {
  expect(TerminalHostViewportReceipt.safeParse({ ...receipt, ...change }).success).toBe(false)
})
