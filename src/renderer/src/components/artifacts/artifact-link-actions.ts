import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'

export async function copyArtifactLink(
  shareUrl: string,
  options: { showSuccessToast?: boolean } = {}
): Promise<boolean> {
  try {
    await window.api.ui.writeClipboardText(shareUrl)
    if (options.showSuccessToast !== false) {
      toast.success(translate('auto.components.artifacts.copySuccess', 'Artifact link copied'))
    }
    return true
  } catch {
    toast.error(translate('auto.components.artifacts.copyFailed', 'Could not copy artifact link'))
    return false
  }
}

export async function openArtifactInBrowser(shareUrl: string): Promise<boolean> {
  try {
    await window.api.shell.openUrl(shareUrl)
    return true
  } catch {
    return false
  }
}
