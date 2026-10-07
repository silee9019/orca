import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'
import { Store } from './persistence'
const source = vi.hoisted(() => ({ resolve: vi.fn() }))
vi.mock('./ephemeral-vm-provisioned-root-source', () => ({
  resolveProvisionedRootSource: source.resolve
}))
import { EphemeralVmOperations } from './ephemeral-vm-operations'

it('reserves a provision ID until cancellation actually settles the existing operation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'orca-vm-id-'))
  let release: (() => void) | undefined
  source.resolve.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = () => resolve(null)
      })
  )
  writeFileSync(
    join(root, 'orca.yaml'),
    'environmentRecipes:\n  - id: fixture\n    name: Fixture\n    checkoutMode: provisioned-root\n    create: ./never-execute\n    destroy: none\n'
  )
  const store = new Store({
    serializedState: JSON.stringify({
      repos: [{ id: 'fixture-repo', path: root, displayName: 'Fixture', addedAt: 1 }]
    }),
    dataFile: join(root, 'profile.json')
  })
  const service = new EphemeralVmOperations(store, root)
  const args = { repoId: 'fixture-repo', recipeId: 'fixture', provisionId: 'fixture-operation' }
  const pending = service.provision(args)
  try {
    await vi.waitFor(() => expect(source.resolve).toHaveBeenCalledOnce())
    await expect(service.provision(args)).rejects.toThrow('provision_id_in_use')
    expect(service.cancelProvision(args)).toEqual({ cancelled: true })
    await expect(service.provision(args)).rejects.toThrow('provision_id_in_use')
    expect(source.resolve).toHaveBeenCalledOnce()
  } finally {
    release?.()
    await pending
    rmSync(root, { recursive: true, force: true })
  }
  expect(service.cancelProvision(args)).toEqual({ cancelled: false })
})
