import { isAbsolute } from 'node:path'
import { defineMethod } from '../core'
import {
  DesktopPetPreferencesParams,
  DesktopPetRemoveParams,
  DesktopPetFileParams,
  DesktopPetImportParams
} from '../../../../shared/rpc-contract/app-lifecycle-params'
import { assertDesktopAppContext } from './desktop-app-target'

async function petStore() {
  const { mainProcessState } = await import('../../../startup/main-process-state')
  if (!mainProcessState.store) {
    throw new Error('Desktop store is unavailable')
  }
  return mainProcessState.store
}

export const DESKTOP_PET_METHODS = [
  defineMethod({
    name: 'desktopPet.preferences',
    params: null,
    handler: async (_params, context) => {
      assertDesktopAppContext(context)
      return (await import('../../../ipc/pet-preferences')).readPetPreferences(await petStore())
    }
  }),
  defineMethod({
    name: 'desktopPet.setPreferences',
    params: DesktopPetPreferencesParams,
    handler: async (params, context) => {
      assertDesktopAppContext(context)
      return (await import('../../../ipc/pet-preferences')).writePetPreferences(
        await petStore(),
        params
      )
    }
  }),
  defineMethod({
    name: 'desktopPet.remove',
    params: DesktopPetRemoveParams,
    handler: async (params, context) => {
      assertDesktopAppContext(context)
      if (params.id !== params.confirmId) {
        throw new Error('Confirm the exact custom pet ID')
      }
      const preferences = await import('../../../ipc/pet-preferences')
      const store = await petStore()
      const pet = preferences.forgetCustomPet(store, params.id)
      await (await import('../../../ipc/pet')).deletePetFile(pet.id, pet.fileName, pet.kind)
      return {
        persisted: true,
        rendered: false,
        bytesDeletion: 'requested' as const,
        preferences: preferences.readPetPreferences(store)
      }
    }
  }),
  defineMethod({
    name: 'desktopPet.import',
    params: DesktopPetImportParams,
    handler: async (params, context) => {
      assertDesktopAppContext(context)
      if (!isAbsolute(params.path)) {
        throw new Error('Pet path must be absolute on the addressed host')
      }
      const store = await petStore()
      const pet = await (params.kind === 'bundle'
        ? (await import('../../../ipc/pet-bundle-import')).importPetBundlePath(params.path)
        : (await import('../../../ipc/pet')).importPetImage(params.path))
      return (await import('../../../ipc/pet-preferences')).adoptCustomPet(store, pet)
    }
  }),
  defineMethod({
    name: 'desktopPet.read',
    params: DesktopPetFileParams,
    handler: async (params, context) => {
      assertDesktopAppContext(context)
      const bytes = await (
        await import('../../../ipc/pet')
      ).readPetFile(params.id, params.fileName, params.kind)
      return bytes
        ? { encoding: 'base64' as const, content: Buffer.from(bytes).toString('base64') }
        : null
    }
  })
]
