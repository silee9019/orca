import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { useAppStore } from '@/store'
import { useExtensionsSidebarController } from '@/runtime/extensions-sidebar-controller'

export function useSidebarExtensionControls() {
  const openAutomationsPage = useAppStore((s) => s.openAutomationsPage)
  const openSkillsPage = useAppStore((s) => s.openSkillsPage)
  const openArtifactsPage = useAppStore((s) => s.openArtifactsPage)
  const showAutomationsButton = useAppStore((s) => shouldShowAutomationsButton(s.settings))
  const showSkillsButton = useAppStore((s) => shouldShowSkillsButton(s.settings))
  const showArtifactsButton = useAppStore((s) => shouldShowArtifactsButton(s.settings))
  const controls = useExtensionsSidebarController({
    ownerKey: useAppStore((s) => s.activeOrcaProfileId),
    activeView: useAppStore((s) => s.activeView),
    modalOpen: useAppStore((s) => s.activeModal !== 'none'),
    visible: {
      automations: showAutomationsButton,
      skills: showSkillsButton,
      artifacts: showArtifactsButton
    },
    open: {
      automations: openAutomationsPage,
      skills: openSkillsPage,
      artifacts: openArtifactsPage
    },
    updateSettings: useAppStore((s) => s.updateSettings)
  })
  return {
    openAutomationsPage,
    openSkillsPage,
    openArtifactsPage,
    showAutomationsButton,
    showSkillsButton,
    showArtifactsButton,
    ...controls
  }
}

export function shouldShowAutomationsButton(
  settings: Partial<Pick<GlobalSettings, 'showAutomationsButton'>> | null | undefined
): boolean {
  return settings?.showAutomationsButton !== false
}

export function shouldShowArtifactsButton(
  settings: Partial<Pick<GlobalSettings, 'showArtifactsButton'>> | null | undefined
): boolean {
  return settings?.showArtifactsButton === true
}

export function shouldShowSkillsButton(
  settings: Partial<Pick<GlobalSettings, 'showSkillsButton'>> | null | undefined
): boolean {
  return settings?.showSkillsButton === true
}
