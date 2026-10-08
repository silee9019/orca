import type { RepoFolderPickerKind, RepoFolderSelection } from '../shared/repo-picker-types'
import { RepoPickerRequests } from './repo-picker-requests'
import { pickRepoIconImage } from './repo-icon-image-picker'
let pickFolder:
  | ((kind: RepoFolderPickerKind, signal: AbortSignal) => Promise<RepoFolderSelection | null>)
  | null = null
const requests = new RepoPickerRequests(async (kind, signal) => {
  if (kind === 'icon') {
    const image = await pickRepoIconImage(signal)
    return image ? { kind: 'icon', image } : null
  }
  if (!pickFolder) {
    throw new Error('runtime_unavailable')
  }
  return pickFolder(kind, signal)
})
export function getRepoPickerRequests(): RepoPickerRequests {
  return requests
}
export function setRepoFolderSelectionPicker(pick: typeof pickFolder): void {
  pickFolder = pick
}
