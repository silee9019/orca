import { describe, expect, it, vi } from 'vitest'
import { SSH_TERMINATE_RECONNECT_REQUIRED } from '../../../../shared/constants'
import { SSH_MANAGEMENT_METHODS, assertLocalSshManagement } from './ssh-management'

describe('SSH management RPC boundary', () => {
  it('rejects paired transports even without a clientId', () => {
    expect(() => assertLocalSshManagement({ clientKind: 'runtime' })).toThrow(
      'local_connection_required'
    )
    expect(() => assertLocalSshManagement({ pairedDeviceId: 'device' })).toThrow(
      'local_connection_required'
    )
    expect(() => assertLocalSshManagement({ authenticatedCallerFingerprint: 'peer' })).toThrow(
      'local_connection_required'
    )
    expect(() => assertLocalSshManagement({})).not.toThrow()
  })
  it('requires exact target confirmation for destructive remote actions', () => {
    const method = SSH_MANAGEMENT_METHODS.find(
      (entry) => entry.name === 'ssh.management.terminateSessions'
    )
    expect(method).toBeDefined()
    expect(method?.params?.safeParse({ targetId: 'host-a', confirmTarget: 'host-b' }).success).toBe(
      false
    )
    expect(method?.params?.safeParse({ targetId: 'host-a', confirmTarget: 'host-a' }).success).toBe(
      true
    )
  })
  it('rejects out of range ports and main-owned target generation', () => {
    const forward = SSH_MANAGEMENT_METHODS.find(
      (entry) => entry.name === 'ssh.management.addPortForward'
    )
    expect(
      forward?.params?.safeParse({
        targetId: 'a',
        localPort: 65536,
        remoteHost: 'localhost',
        remotePort: 80
      }).success
    ).toBe(false)
    const target = SSH_MANAGEMENT_METHODS.find((entry) => entry.name === 'ssh.management.addTarget')
    expect(
      target?.params?.safeParse({
        target: { label: 'a', host: 'host', username: 'user', port: 22, generation: 99 }
      }).success
    ).toBe(false)
    expect(
      target?.params?.safeParse({
        target: {
          label: 'a',
          host: 'host',
          username: 'user',
          port: 22,
          relayGracePeriodExplicit: true
        }
      }).success
    ).toBe(false)
  })
})

import { buildRegistry } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
const fixture = vi.hoisted(() => ({
  targets: new Map<string, { id: string; label: string; host: string; generation: number }>(),
  removedForward: vi.fn(),
  terminateSessions: vi.fn(),
  connect: vi.fn(),
  removeTarget: vi.fn(),
  forwards: [
    {
      id: 'forward-a',
      connectionId: 'host-a',
      localPort: 8080,
      remotePort: 80,
      remoteHost: 'localhost'
    }
  ]
}))
vi.mock('../../../ssh/ssh-target-registry', () => ({
  listRegisteredRemovedSshTargetLabels: () => ({}),
  connectRegisteredSshTarget: fixture.connect,
  getSshConnectionManagement: () => ({ terminateSessions: fixture.terminateSessions }),
  getSshTargetManagement: () => ({
    removeTarget: fixture.removeTarget,
    listConfigHosts: () => ({
      hosts: [
        {
          alias: 'fixture',
          port: 22,
          hostname: 'private',
          username: 'user',
          identityFile: 'key-secret-canary',
          proxyCommand: 'proxy-secret-canary',
          jumpHost: 'jump-secret-canary',
          alreadyInOrca: false
        }
      ],
      totalHostCount: 1,
      newHostCount: 1,
      matchCount: 1,
      hasMore: false
    }),
    resolveConfigHost: async () => ({
      alias: 'fixture',
      hostname: 'private',
      port: 22,
      username: 'user',
      identityFiles: ['private-key'],
      proxyCommand: 'proxy-secret-canary',
      jumpHost: 'jump-secret-canary',
      identityAgent: 'agent-secret-canary'
    }),
    addTarget: ({ target }: { target: { label: string; host: string } }) => {
      const saved = {
        id: 'host-a',
        label: target.label,
        host: target.host,
        generation: 1,
        relayGracePeriodExplicit: true as const
      }
      fixture.targets.set(saved.id, saved)
      return { target: saved, repoReadoptions: [] }
    }
  }),
  getSshPortForwardManagement: () => ({
    listPortForwards: ({ targetId }: { targetId: string }) =>
      fixture.forwards.filter((entry) => entry.connectionId === targetId),
    removePortForward: fixture.removedForward
  })
}))
const registry = buildRegistry(SSH_MANAGEMENT_METHODS)
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: These methods inspect transport identity and never access runtime services.
const runtime = {} as OrcaRuntimeService

it('persists through the owner adapter and redacts private host details from the response', async () => {
  const method = registry.get('ssh.management.addTarget')
  if (!method || 'stream' in method) {
    throw new Error('missing management method')
  }
  const args = method.params?.parse({
    target: { label: 'fixture', host: 'private.example', username: 'fixture', port: 22 }
  })
  const result = await method.handler(args, { runtime })
  expect(fixture.targets.get('host-a')?.host).toBe('private.example')
  expect(result).toEqual({
    target: { id: 'host-a', label: 'fixture', generation: 1 },
    repoReadoptions: []
  })
})
it('denies paired management before invoking the owning adapter', async () => {
  fixture.targets.clear()
  const method = registry.get('ssh.management.addTarget')
  if (!method || 'stream' in method) {
    throw new Error('missing management method')
  }
  await expect(
    method.handler(
      { target: { label: 'denied', host: 'private.example' } },
      { runtime, clientKind: 'runtime' }
    )
  ).rejects.toThrow('local_connection_required')
  expect(fixture.targets.size).toBe(0)
})
it('refuses a forward id belonging to a different target before removal', async () => {
  const method = registry.get('ssh.management.removePortForward')
  if (!method || 'stream' in method) {
    throw new Error('missing management method')
  }
  await expect(
    method.handler({ id: 'forward-a', targetId: 'host-b', confirmTarget: 'host-b' }, { runtime })
  ).rejects.toThrow('port_forward_target_mismatch')
  expect(fixture.removedForward).not.toHaveBeenCalled()
})

it('projects resolved SSH config without free-text credentials', async () => {
  const method = registry.get('ssh.management.resolveConfigHost')
  if (!method || 'stream' in method) {
    throw new Error('missing management method')
  }
  const result = await method.handler({ alias: 'fixture' }, { runtime })
  expect(JSON.stringify(result)).not.toContain('secret-canary')
  expect(result).toEqual({
    alias: 'fixture',
    port: 22,
    configured: {
      hostname: true,
      username: true,
      identityFiles: true,
      identityAgent: true,
      proxyCommand: true,
      jumpHost: true
    }
  })
})

it('projects config picker summaries without proxy commands or private paths', async () => {
  const method = registry.get('ssh.management.listConfigHosts')
  if (!method || 'stream' in method) {
    throw new Error('missing management method')
  }
  const result = await method.handler({}, { runtime })
  expect(JSON.stringify(result)).not.toContain('secret-canary')
  expect(result).toMatchObject({
    hosts: [{ alias: 'fixture', configured: { proxyCommand: true } }]
  })
})

async function invokeLifecycle(name: string) {
  const method = registry.get(name)
  if (!method || 'stream' in method) {
    throw new Error('missing management method')
  }
  return method.handler({ targetId: 'host-a', confirmTarget: 'host-a' }, { runtime })
}
it('reconnects detached sessions before retrying termination and preserves offline verdict', async () => {
  fixture.connect.mockReset().mockResolvedValue(undefined)
  fixture.terminateSessions
    .mockReset()
    .mockRejectedValueOnce(new Error(SSH_TERMINATE_RECONNECT_REQUIRED))
    .mockResolvedValueOnce({ terminated: 0, unverifiable: 2 })
  expect(await invokeLifecycle('ssh.management.terminateSessions')).toEqual({
    terminated: 0,
    unverifiable: 2
  })
  expect(fixture.connect).toHaveBeenCalledWith('host-a')
  expect(fixture.terminateSessions).toHaveBeenCalledTimes(2)
})
it('removes metadata after a failed reconnect without claiming remote termination', async () => {
  fixture.removeTarget.mockReset().mockResolvedValue(undefined)
  fixture.connect.mockReset().mockRejectedValue(new Error('private-error-canary'))
  fixture.terminateSessions
    .mockReset()
    .mockRejectedValue(new Error(SSH_TERMINATE_RECONNECT_REQUIRED))
  const result = await invokeLifecycle('ssh.management.removeTarget')
  expect(fixture.connect).toHaveBeenCalledWith('host-a')
  expect(fixture.removeTarget).toHaveBeenCalledWith({ id: 'host-a' })
  expect(result).toEqual({ removed: 'host-a', cleanup: { failed: true } })
  expect(JSON.stringify(result)).not.toContain('private-error-canary')
})
it('returns unverifiable cleanup counts while still removing the exact target', async () => {
  fixture.removeTarget.mockReset().mockResolvedValue(undefined)
  fixture.terminateSessions.mockReset().mockResolvedValue({ terminated: 0, unverifiable: 3 })
  expect(await invokeLifecycle('ssh.management.removeTarget')).toEqual({
    removed: 'host-a',
    cleanup: { failed: false, outcome: { terminated: 0, unverifiable: 3 } }
  })
})
