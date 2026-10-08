import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import type { PersistedUIState } from '../../shared/persisted-ui-state-types'
import { DEFAULT_PET_ID } from '../../shared/pet-catalog'
import {
  adoptCustomPet,
  forgetCustomPet,
  readPetPreferences,
  writePetPreferences
} from './pet-preferences'

it('persists selection, clamps size and restores the bundled fallback when a custom pet is removed', () => {
  const profile = mkdtempSync(join(tmpdir(), 'orca-pet-state-'))
  const file = join(profile, 'ui.json')
  let ui: Pick<PersistedUIState, 'petVisible' | 'petId' | 'petSize' | 'customPets'> = {}
  const store = {
    getUI: () => ui,
    updateUI: (updates: Partial<PersistedUIState>) => {
      ui = { ...ui, ...updates }
    },
    flush: () => writeFileSync(file, JSON.stringify(ui))
  }
  try {
    const pet = {
      id: '141aa7cc-6e19-45ea-88e5-e735e95e4119',
      fileName: 'fixture.png',
      label: 'Fixture',
      mimeType: 'image/png',
      kind: 'image' as const
    }
    expect(adoptCustomPet(store, pet)).toMatchObject({ persisted: true, rendered: false })
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({
      petId: pet.id,
      petVisible: true,
      customPets: [pet]
    })
    writePetPreferences(store, { visible: false, size: 999 })
    expect(readPetPreferences(store)).toMatchObject({ visible: false, size: 360, id: pet.id })
    expect(() => writePetPreferences(store, { id: 'missing' })).toThrow(/registered/)
    expect(forgetCustomPet(store, pet.id)).toEqual(pet)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({
      petId: DEFAULT_PET_ID,
      customPets: []
    })
  } finally {
    rmSync(profile, { recursive: true, force: true })
  }
})
