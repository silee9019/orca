import type { Store } from '../persistence'
import type { PersistedUIState } from '../../shared/persisted-ui-state-types'
import type { CustomPet } from '../../shared/pet-types'
import { PET_SIZE_DEFAULT, PET_SIZE_MAX, PET_SIZE_MIN } from '../../shared/pet-types'
import { BUNDLED_PET_IDS, DEFAULT_PET_ID } from '../../shared/pet-catalog'

type PetStore = Pick<Store, 'updateUI' | 'flush'> & {
  getUI: () => Pick<PersistedUIState, 'petVisible' | 'petId' | 'petSize' | 'customPets'>
}
export function readPetPreferences(store: PetStore) {
  const ui = store.getUI()
  return {
    visible: ui.petVisible ?? true,
    id: ui.petId ?? DEFAULT_PET_ID,
    size: ui.petSize ?? PET_SIZE_DEFAULT,
    customPets: ui.customPets ?? [],
    bundledIds: BUNDLED_PET_IDS
  }
}
export function writePetPreferences(
  store: PetStore,
  input: { visible?: boolean; id?: string; size?: number }
) {
  const current = readPetPreferences(store)
  if (
    input.id !== undefined &&
    !BUNDLED_PET_IDS.some((id) => id === input.id) &&
    !current.customPets.some((pet) => pet.id === input.id)
  ) {
    throw new Error('Select a bundled or registered custom pet ID')
  }
  store.updateUI({
    ...(input.visible === undefined ? {} : { petVisible: input.visible }),
    ...(input.id === undefined ? {} : { petId: input.id }),
    ...(input.size === undefined
      ? {}
      : { petSize: Math.min(PET_SIZE_MAX, Math.max(PET_SIZE_MIN, Math.round(input.size))) })
  })
  store.flush()
  return { persisted: true, rendered: false, preferences: readPetPreferences(store) }
}
export function adoptCustomPet(store: PetStore, pet: CustomPet) {
  const current = readPetPreferences(store)
  store.updateUI({
    customPets: [...current.customPets.filter((item) => item.id !== pet.id), pet],
    petId: pet.id,
    petVisible: true
  })
  store.flush()
  return { persisted: true, rendered: false, pet, preferences: readPetPreferences(store) }
}
export function forgetCustomPet(store: PetStore, id: string): CustomPet {
  const current = readPetPreferences(store)
  const pet = current.customPets.find((item) => item.id === id)
  if (!pet) {
    throw new Error('Custom pet is not registered')
  }
  store.updateUI({
    customPets: current.customPets.filter((item) => item.id !== id),
    ...(current.id === id ? { petId: DEFAULT_PET_ID } : {})
  })
  store.flush()
  return pet
}
