import { expect, it } from 'vitest'
import { getToggledAllHostIds, getToggledHostIds } from './sidebar-host-scope-toggle'

const hosts = ['local', 'ssh:fixture', 'runtime:fixture'] as const
it('keeps the existing all-host and last-host toggle rules', () => {
  expect(getToggledAllHostIds(null, hosts)).toEqual(['local'])
  expect(getToggledAllHostIds(['ssh:fixture'], hosts)).toBeNull()
  expect(getToggledAllHostIds(null, [])).toBeUndefined()
  expect(getToggledHostIds(null, hosts, 'ssh:fixture')).toEqual(['ssh:fixture'])
  expect(getToggledHostIds(['local'], hosts, 'local')).toBeUndefined()
  expect(getToggledHostIds(['local', 'ssh:fixture'], hosts, 'local')).toEqual(['ssh:fixture'])
  expect(getToggledHostIds(['local', 'ssh:fixture'], hosts, 'runtime:fixture')).toBeNull()
})
