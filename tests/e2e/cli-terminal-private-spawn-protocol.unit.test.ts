import { expect, it } from 'vitest'
import { COMMAND_SPECS } from '../../src/cli/specs'
it('registers private pinned terminal spawn', () => {
  expect(COMMAND_SPECS.some((spec) => spec.path.join(' ') === 'terminal spawn')).toBe(true)
})

import {
  TerminalPrivateSpawnParams,
  TerminalPrivateSpawnReceipt
} from '../../src/shared/rpc-contract/terminal-private-spawn-params'
import {
  assertTerminalSpawnLaunchScope,
  resolveTerminalSpawnInitialSize
} from '../../src/main/runtime/terminal-spawn-launch-scope'
const params = {
  expectedRuntimeId: 'fixture',
  expectedExecutionHostId: 'local',
  worktreeId: 'workspace',
  clientMutationId: '11111111-1111-4111-8111-111111111111',
  cols: 97,
  rows: 29,
  confirm: true
}
it.each([
  { cols: 0 },
  { rows: 1001 },
  { confirm: false },
  { expectedExecutionHostId: 'runtime:proxy:local' },
  { shell: 'powershell.exe -Command fixture' },
  { tabId: 'missing-leaf' },
  { initiallyHidden: false },
  { rendererBacked: true },
  { env: Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`KEY${index}`, 'fixture'])) }
])('refuses invalid or renderer-owned spawn options: %j', (change) => {
  expect(TerminalPrivateSpawnParams.safeParse({ ...params, ...change }).success).toBe(false)
})
it('preserves the default size and validates explicit grids', () => {
  expect(resolveTerminalSpawnInitialSize()).toEqual({ cols: 120, rows: 40 })
  expect(resolveTerminalSpawnInitialSize({ cols: 97, rows: 29 })).toEqual({ cols: 97, rows: 29 })
  expect(() => resolveTerminalSpawnInitialSize({ cols: 0, rows: 29 })).toThrow(
    'terminal_spawn_invalid_initial_size'
  )
})
it('pins execution host and exact folder/worktree identity without local fallback', () => {
  const scope = {
    id: 'workspace',
    path: '/fixture',
    connectionId: 'fixture',
    repo: null,
    folderWorkspace: null
  }
  expect(() =>
    assertTerminalSpawnLaunchScope(scope, {
      worktreeId: 'workspace',
      executionHostId: 'ssh:fixture'
    })
  ).not.toThrow()
  expect(() =>
    assertTerminalSpawnLaunchScope(scope, { worktreeId: 'workspace', executionHostId: 'local' })
  ).toThrow('terminal_spawn_launch_scope_changed')
  expect(() =>
    assertTerminalSpawnLaunchScope(scope, { worktreeId: 'other', executionHostId: 'ssh:fixture' })
  ).toThrow('terminal_spawn_launch_scope_changed')
})
it.each([
  { rendererApplied: true },
  { providerGeometryVerified: true },
  { command: 'private fixture' }
])('rejects unsupported completion or private response fields: %j', (change) => {
  expect(
    TerminalPrivateSpawnReceipt.safeParse({
      expectedRuntimeId: 'fixture',
      clientMutationId: params.clientMutationId,
      terminal: {
        handle: 'term-fixture',
        ptyId: 'pty-fixture',
        worktreeId: 'workspace',
        executionHostId: 'local',
        surface: 'background',
        isReattach: false
      },
      requested: { cols: 97, rows: 29 },
      rendererApplied: false,
      providerGeometryVerified: false,
      ...change
    }).success
  ).toBe(false)
})
