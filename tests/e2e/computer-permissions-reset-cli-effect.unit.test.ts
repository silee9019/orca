// @vitest-environment happy-dom
import { act } from 'react'
import { expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { computerPermissionsOwnerSocketFixture } from './computer-permissions-owner-socket.fixture'
import { requestComputerPermissionsViewer } from '../../src/renderer/src/runtime/computer-permissions-viewer-request'
import { useAppStore } from '../../src/renderer/src/store'
vi.mock('../../src/renderer/src/components/settings/ComputerUseSkillSetupPanel', () => ({
  ComputerUseSkillSetupPanel: () => null
}))
vi.mock('../../src/cli/runtime/launch', () => ({
  launchOrcaApp: () => {
    throw new Error('Fixture refuses app launch')
  }
}))
it.skipIf(process.platform === 'win32')(
  'resets the exact mounted permission owner with confirmation and committed readback',
  async () => {
    const fixture = await computerPermissionsOwnerSocketFixture()
    const messages = vi.spyOn(toast, 'message').mockImplementation(() => 0)
    try {
      await expect(fixture.invoke('reset')).rejects.toThrow()
      await expect(fixture.invoke('reset', 'other-target')).rejects.toThrow()
      expect(fixture.reset).not.toHaveBeenCalled()
      fixture.status.permissions = fixture.status.permissions.map((permission) => ({
        ...permission,
        status: 'not-granted'
      }))
      await fixture.invoke('reset', 'computer-use-permissions')
      expect(fixture.reset).toHaveBeenCalledTimes(1)
      expect(fixture.container.textContent).toContain('2 permissions required')
      expect(messages).toHaveBeenCalledWith('Reset Computer Use access')
      const output = fixture.output.mock.calls.at(-1)?.[0]
      expect(JSON.parse(output).result.computerPermissions.permissions).toEqual(
        fixture.status.permissions
      )
      expect(output).not.toContain('private-')
      await act(async () => useAppStore.setState({ activeModal: 'quick-open' }))
      await expect(fixture.invoke('reset', 'computer-use-permissions')).rejects.toThrow(
        'viewer_modal_busy'
      )
      expect(fixture.reset).toHaveBeenCalledTimes(1)
    } finally {
      await fixture.close()
    }
  }
)

it.skipIf(process.platform === 'win32')(
  'rejects duplicate and unavailable owners before reset effects',
  async () => {
    const fixture = await computerPermissionsOwnerSocketFixture()
    try {
      await fixture.renderOwner(2)
      await expect(fixture.invoke('reset', 'computer-use-permissions')).rejects.toThrow(
        'computer_permissions_owner_ambiguous'
      )
      expect(fixture.reset).not.toHaveBeenCalled()
      await fixture.renderOwner(1)
      fixture.status.platform = 'linux'
      await fixture.invoke('refresh')
      await expect(fixture.invoke('reset', 'computer-use-permissions')).rejects.toThrow(
        'computer_permissions_reset_unavailable'
      )
      fixture.status.platform = 'darwin'
      await fixture.renderOwner(0)
      fixture.status.helperUnavailableReason = 'private-helper-failure'
      await fixture.renderOwner(1)
      await expect(fixture.invoke('reset', 'computer-use-permissions')).rejects.toThrow(
        'computer_permissions_reset_busy_or_unavailable'
      )
      expect(fixture.reset).not.toHaveBeenCalled()
    } finally {
      await fixture.close()
    }
  }
)

it.skipIf(process.platform === 'win32')(
  'fences native setup, refresh and UI reset before React commit',
  async () => {
    const fixture = await computerPermissionsOwnerSocketFixture()
    let release = (): void => {}
    try {
      fixture.openSetup.mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return { ...fixture.status, launchedHelper: false }
      })
      let rejected: Promise<unknown> | undefined
      await act(async () => {
        Array.from(fixture.container.querySelectorAll('button'))
          .find((button) => button.textContent === 'Open')
          ?.click()
        rejected = requestComputerPermissionsViewer(
          { action: 'reset', confirm: 'computer-use-permissions' },
          Date.now() + 3000
        )
        void rejected.catch(() => {})
      })
      await expect(rejected).rejects.toThrow('computer_permissions_reset_busy_or_unavailable')
      expect(fixture.reset).not.toHaveBeenCalled()
      await act(async () => release())
      fixture.getStatus.mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return fixture.status
      })
      await act(async () => {
        Array.from(fixture.container.querySelectorAll('button'))
          .find((button) => button.textContent === 'Refresh')
          ?.click()
        rejected = requestComputerPermissionsViewer(
          { action: 'reset', confirm: 'computer-use-permissions' },
          Date.now() + 3000
        )
        void rejected.catch(() => {})
      })
      await expect(rejected).rejects.toThrow('computer_permissions_reset_busy_or_unavailable')
      expect(fixture.reset).not.toHaveBeenCalled()
      await act(async () => release())
      fixture.reset.mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return fixture.status
      })
      await act(async () => {
        Array.from(fixture.container.querySelectorAll('button'))
          .find((button) => button.textContent === 'Reset access')
          ?.click()
        rejected = requestComputerPermissionsViewer(
          { action: 'reset', confirm: 'computer-use-permissions' },
          Date.now() + 3000
        )
        void rejected.catch(() => {})
      })
      await expect(rejected).rejects.toThrow('computer_permissions_reset_busy_or_unavailable')
      expect(fixture.reset).toHaveBeenCalledTimes(1)
      await act(async () => release())
    } finally {
      release()
      await fixture.close()
    }
  }
)

it.skipIf(process.platform === 'win32')(
  'reports provider failure and late owner changes without successful rollback claims',
  async () => {
    const fixture = await computerPermissionsOwnerSocketFixture()
    const errors = vi.spyOn(toast, 'error').mockImplementation(() => 0)
    const messages = vi.spyOn(toast, 'message').mockImplementation(() => 0)
    let release = (): void => {}
    try {
      fixture.reset.mockRejectedValueOnce(new Error('private-reset-provider-error'))
      await expect(fixture.invoke('reset', 'computer-use-permissions')).rejects.toThrow(
        'computer_permissions_reset_failed_effect_unknown'
      )
      expect(errors).toHaveBeenCalledWith('private-reset-provider-error')
      expect(fixture.output.mock.calls).toHaveLength(0)
      expect(fixture.container.textContent).toContain('Computer Use is ready.')
      fixture.reset.mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return {
          ...fixture.status,
          permissions: fixture.status.permissions.map((permission) => ({
            ...permission,
            status: 'not-granted'
          }))
        }
      })
      const late = fixture.invoke('reset', 'computer-use-permissions')
      void late.catch(() => {})
      await vi.waitFor(() => expect(fixture.reset).toHaveBeenCalledTimes(2))
      await act(async () => {
        useAppStore.setState({ activeModal: 'quick-open' })
        release()
      })
      await expect(late).rejects.toThrow('computer_permissions_reset_failed_effect_unknown')
      expect(fixture.output.mock.calls).toHaveLength(0)
      expect(messages).not.toHaveBeenCalled()
      expect(fixture.container.textContent).toContain('Computer Use is ready.')
    } finally {
      release()
      await fixture.close()
    }
  }
)

it.skipIf(process.platform === 'win32')(
  'does not acknowledge an older reset while a UI reset starts before commit',
  async () => {
    const fixture = await computerPermissionsOwnerSocketFixture()
    let release = (): void => {}
    try {
      fixture.reset.mockImplementationOnce(async () => fixture.status)
      fixture.reset.mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return fixture.status
      })
      let older: Promise<unknown> | undefined
      await act(async () => {
        older = requestComputerPermissionsViewer(
          { action: 'reset', confirm: 'computer-use-permissions' },
          Date.now() + 3000
        )
        void older.catch(() => {})
        for (let turn = 0; turn < 20; turn++) {
          await Promise.resolve()
        }
        Array.from(fixture.container.querySelectorAll('button'))
          .find((button) => button.textContent === 'Reset access')
          ?.click()
      })
      await expect(older).rejects.toThrow('computer_permissions_reset_failed_effect_unknown')
      expect(fixture.reset).toHaveBeenCalledTimes(2)
      expect(fixture.container.textContent).toContain('Resetting access...')
      await act(async () => release())
    } finally {
      release()
      await fixture.close()
    }
  }
)

it.skipIf(process.platform === 'win32')(
  'rejects expired commands before effect and unmounted owners after a reset has started',
  async () => {
    const fixture = await computerPermissionsOwnerSocketFixture()
    let release = (): void => {}
    try {
      await expect(
        requestComputerPermissionsViewer(
          { action: 'reset', confirm: 'computer-use-permissions' },
          Date.now() - 1
        )
      ).rejects.toThrow('computer_permissions_request_expired')
      expect(fixture.reset).not.toHaveBeenCalled()
      fixture.reset.mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return fixture.status
      })
      const unmounted = fixture.invoke('reset', 'computer-use-permissions')
      void unmounted.catch(() => {})
      await vi.waitFor(() => expect(fixture.reset).toHaveBeenCalledTimes(1))
      await fixture.renderOwner(0)
      await expect(unmounted).rejects.toThrow('computer_permissions_owner_changed_effect_unknown')
      await act(async () => release())
      expect(fixture.output.mock.calls).toHaveLength(0)
    } finally {
      release()
      await fixture.close()
    }
  }
)
