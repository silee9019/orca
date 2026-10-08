import { describe, expect, it } from 'vitest'
import { EPHEMERAL_VM_METHODS, publicVmRuntime, publicVmRecipe } from './ephemeral-vm'

describe('ephemeral VM RPC', () => {
  it('covers every VM operation with input schemas', () => {
    expect(EPHEMERAL_VM_METHODS.map((method) => method.name)).toEqual([
      'vm.recipes.list',
      'vm.recipes.catalog',
      'vm.doctor',
      'vm.provision',
      'vm.provision.cancel',
      'vm.provision.status',
      'vm.runtimes.list',
      'vm.attach',
      'vm.cleanup',
      'vm.cleanup.stop',
      'vm.suspend',
      'vm.resume',
      'vm.cleanup.command'
    ])
    const provision = EPHEMERAL_VM_METHODS.find((method) => method.name === 'vm.provision')
    if (!provision?.params) {
      throw new Error('Missing provision schema')
    }
    expect(provision.params.safeParse({ repoId: '', recipeId: 'x' }).success).toBe(false)
    expect(
      provision.params.safeParse({ repoId: 'r', recipeId: 'x', provisionId: 'p' }).success
    ).toBe(true)
  })
  it('publishes runtime state without recipe credentials or scripts', () => {
    const result = publicVmRuntime({
      id: 'vm',
      recipeId: 'fixture',
      status: 'running',
      cleanupStatus: 'not_started',
      createdAt: 1,
      updatedAt: 1,
      recipeResult: { schemaVersion: 1, pairingCode: 'fixture-credential', projectRoot: '/fixture' }
    })
    expect(result).toEqual({
      id: 'vm',
      recipeId: 'fixture',
      status: 'running',
      cleanupStatus: 'not_started',
      createdAt: 1,
      updatedAt: 1
    })
    expect(JSON.stringify(result)).not.toContain('fixture-credential')
  })
  it('projects recipe metadata without provider commands', () => {
    const result = publicVmRecipe({
      id: 'fixture',
      name: 'Fixture',
      create: 'provider --token fixture-secret',
      suspend: 'secret suspend',
      resume: 'secret resume',
      destroy: 'secret destroy'
    })
    expect(result).toMatchObject({ id: 'fixture', name: 'Fixture', canSuspend: true })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(result).not.toHaveProperty('create')
  })
})
