import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { useAppStore } from '../../store'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import { useBrowserSettingsRequest } from './use-browser-settings-request'

type BrowserNewProfileDialogProps = {
  open: boolean
  hostId?: string
  onOpenChange: (open: boolean) => void
}

export function BrowserNewProfileDialog({
  open,
  hostId = 'local',
  onOpenChange
}: BrowserNewProfileDialogProps): React.JSX.Element {
  const mountedRef = useMountedRef()
  const [newProfileName, setNewProfileName] = useState('')
  const [isCreatingProfile, setIsCreatingProfile] = useState(false)
  const creatingRef = useRef(false)

  const handleClose = (): void => {
    onOpenChange(false)
    setNewProfileName('')
  }

  const createProfile = async (): Promise<boolean> => {
    const trimmed = newProfileName.trim()
    if (!trimmed || creatingRef.current) {
      return false
    }
    creatingRef.current = true
    setIsCreatingProfile(true)
    try {
      const profile = await useAppStore.getState().createBrowserSessionProfile('isolated', trimmed)
      if (!mountedRef.current) {
        return false
      }
      if (profile) {
        handleClose()
        toast.success(
          translate(
            'auto.components.settings.BrowserPane.8f22b7580d',
            'Profile "{{value0}}" created.',
            { value0: profile.label }
          )
        )
      } else {
        toast.error(
          translate('auto.components.settings.BrowserPane.612f7f6861', 'Failed to create profile.')
        )
      }
      return profile !== null
    } finally {
      creatingRef.current = false
      if (mountedRef.current) {
        setIsCreatingProfile(false)
      }
    }
  }
  useBrowserSettingsRequest({
    accepts: (command) =>
      ['profile-name', 'profile-create', 'profile-dialog-close', 'profile-dialog-status'].includes(
        command.action
      ),
    apply: async (command) => {
      if (command.action === 'profile-dialog-status') {
        return
      }
      if (!open || isCreatingProfile) {
        throw new Error('browser_profile_dialog_unavailable_or_busy')
      }
      if (command.action === 'profile-name') {
        setNewProfileName(command.value)
      } else if (command.action === 'profile-dialog-close') {
        handleClose()
      } else if (command.action === 'profile-create') {
        if (!newProfileName.trim()) {
          throw new Error('browser_profile_name_required')
        }
        if (!(await createProfile())) {
          throw new Error('browser_profile_create_failed')
        }
      }
    },
    read: () => ({
      hostId,
      dialogOpen: open,
      profileNamePresent: newProfileName.length > 0,
      creating: isCreatingProfile
    })
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          handleClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-base">
            {translate('auto.components.settings.BrowserPane.8481ee0331', 'New Browser Profile')}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            await createProfile()
          }}
        >
          <Input
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            placeholder={translate(
              'auto.components.settings.BrowserPane.7d4c0a2aa4',
              'Profile name'
            )}
            autoFocus
            maxLength={50}
            className="mb-3"
          />
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={handleClose}>
              {translate('auto.components.settings.BrowserPane.81ff774667', 'Cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={!newProfileName.trim() || isCreatingProfile}>
              {isCreatingProfile
                ? translate('auto.components.settings.BrowserPane.7b649a578a', 'Creating…')
                : translate('auto.components.settings.BrowserPane.64898ecdab', 'Create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
