import type { KeybindingFileSnapshot } from '../../shared/keybindings'
import type { KeybindingService } from './keybinding-service'

export function createKeybindingFileOperations(
  service: Pick<KeybindingService, 'ensureFile'>,
  effects: {
    onChanged?: (snapshot: KeybindingFileSnapshot) => void
    openPath?: (path: string) => Promise<string>
    showItemInFolder?: (path: string) => void
  } = {}
) {
  return {
    ensureFile(): KeybindingFileSnapshot {
      const snapshot = service.ensureFile()
      effects.onChanged?.(snapshot)
      return snapshot
    },
    async openFile(): Promise<KeybindingFileSnapshot> {
      if (!effects.openPath) {
        throw new Error('Opening the keybindings file requires a desktop on this host')
      }
      const snapshot = service.ensureFile()
      const error = await effects.openPath(snapshot.path)
      if (error) {
        throw new Error(error)
      }
      return snapshot
    },
    revealFile(): KeybindingFileSnapshot {
      if (!effects.showItemInFolder) {
        throw new Error('Revealing the keybindings file requires a desktop on this host')
      }
      const snapshot = service.ensureFile()
      effects.showItemInFolder(snapshot.path)
      return snapshot
    }
  }
}
