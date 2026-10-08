import { useAppStore } from '@/store'
export function openFeatureTourFromHelp(): void {
  useAppStore.getState().openModal('feature-wall', { source: 'help_menu' })
}
