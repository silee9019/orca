import { ipcMain } from 'electron'
import { sanitizeOnboardingUpdate, type Store } from '../persistence'
import type { OnboardingState } from '../../shared/onboarding-state-types'

export function createOnboardingOperations(store: Store) {
  return {
    get: (): OnboardingState => store.getOnboarding(),
    update: (updates: unknown): OnboardingState => {
      return store.updateOnboarding(sanitizeOnboardingUpdate(updates))
    }
  }
}
let operations: ReturnType<typeof createOnboardingOperations> | null = null
export function getOnboardingOperations(): ReturnType<typeof createOnboardingOperations> {
  if (!operations) {
    throw new Error('onboarding services are unavailable')
  }
  return operations
}
export function registerOnboardingHandlers(store: Store): void {
  const current = createOnboardingOperations(store)
  operations = current
  ipcMain.removeHandler('onboarding:get')
  ipcMain.handle('onboarding:get', (_event, ...args: Parameters<typeof current.get>) =>
    current.get(...args)
  )
  ipcMain.removeHandler('onboarding:update')
  ipcMain.handle('onboarding:update', (_event, ...args: Parameters<typeof current.update>) =>
    current.update(...args)
  )
}
