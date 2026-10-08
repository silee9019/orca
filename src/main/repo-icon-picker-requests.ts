import type { RepoIconPickedImage } from '../shared/repo-icon-picker-types'
import { RepoPickerRequests } from './repo-picker-requests'
export class RepoIconPickerRequests extends RepoPickerRequests {
  constructor(pick: (signal: AbortSignal) => Promise<RepoIconPickedImage | null>) {
    super(async (kind, signal) => {
      if (kind !== 'icon') {
        throw new Error('Unsupported icon picker kind.')
      }
      const image = await pick(signal)
      return image ? { kind: 'icon', image } : null
    })
  }
}
