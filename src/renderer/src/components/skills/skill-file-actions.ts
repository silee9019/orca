import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'

export async function copySkillPath(path: string): Promise<void> {
  await window.api.ui.writeClipboardText(path)
  toast.success(translate('auto.components.skills.SkillRow.pathCopied', 'Path copied'))
}
export async function revealSkillFile(path: string) {
  const result = await window.api.shell.openInFileManager(path)
  if (!result.ok) {
    toast.error(
      translate('auto.components.skills.SkillsPage.995fde8337', 'Could not reveal skill file')
    )
  }
  return result
}
