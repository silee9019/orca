import { useAppStore } from '@/store'
export function openSetupGuideFromHelp(): void {
  useAppStore.getState().openModal('setup-guide', { telemetrySource: 'help_menu' })
}
