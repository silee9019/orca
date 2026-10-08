// @vitest-environment happy-dom
import { act } from 'react'
import { expect, it, vi } from 'vitest'
import { browserImportHintOwnerSocketFixture } from './browser-import-hint-owner-socket.fixture'
import { useAppStore } from '../../src/renderer/src/store'
vi.mock('../../src/cli/runtime/launch', () => ({
  launchOrcaApp: () => {
    throw new Error('Fixture refuses app launch')
  }
}))
it
  .skipIf(process.platform === 'win32')
  .each([
    'workspace',
    'host',
    'runtime',
    'profile',
    'page-host',
    'page-binding',
    'active-page',
    'view',
    'modal',
    'hint-hidden'
  ])('rejects same-act Store identity ABA during held detection: %s', async (cycle) => {
  const fixture = await browserImportHintOwnerSocketFixture()
  let release = () => {}
  try {
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    fixture.detect.mockImplementationOnce(async () => {
      await held
      return []
    })
    const operation = fixture.invoke('open')
    const rejected = expect(operation).rejects.toThrow('browser_import_hint_effect_unknown')
    await vi.waitFor(() => expect(fixture.detect).toHaveBeenCalledTimes(1))
    const original = useAppStore.getState()
    await act(async () => {
      if (cycle === 'workspace') {
        useAppStore.setState({ activeWorktreeId: 'other' })
        useAppStore.setState({ activeWorktreeId: original.activeWorktreeId })
      } else if (cycle === 'host') {
        useAppStore.setState({ browserSessionHostIdOverride: 'runtime:other' })
        useAppStore.setState({
          browserSessionHostIdOverride: original.browserSessionHostIdOverride
        })
      } else if (cycle === 'runtime') {
        useAppStore.setState({
          settings: { ...original.settings!, activeRuntimeEnvironmentId: 'other' }
        })
        useAppStore.setState({ settings: original.settings })
      } else if (cycle === 'view') {
        useAppStore.setState({ activeView: 'settings' })
        useAppStore.setState({ activeView: original.activeView })
      } else if (cycle === 'modal') {
        useAppStore.setState({ activeModal: 'quick-open' })
        useAppStore.setState({ activeModal: original.activeModal })
      } else if (cycle === 'hint-hidden') {
        useAppStore.setState({ browserImportHintHidden: true })
        useAppStore.setState({ browserImportHintHidden: original.browserImportHintHidden })
      } else if (cycle === 'profile' || cycle === 'active-page') {
        useAppStore.setState({
          browserTabsByWorktree: {
            work: original.browserTabsByWorktree.work.map((tab) => ({
              ...tab,
              ...(cycle === 'profile' ? { sessionProfileId: 'other' } : { activePageId: 'other' })
            }))
          }
        })
        useAppStore.setState({ browserTabsByWorktree: original.browserTabsByWorktree })
      } else {
        useAppStore.setState({
          browserPagesByWorkspace: {
            tab: original.browserPagesByWorkspace.tab.map((page) => ({
              ...page,
              ...(cycle === 'page-host'
                ? { browserRuntimeEnvironmentId: 'other' }
                : { workspaceId: 'other' })
            }))
          }
        })
        useAppStore.setState({ browserPagesByWorkspace: original.browserPagesByWorkspace })
      }
    })
    await rejected
    await act(async () => release())
    expect(fixture.output).not.toHaveBeenCalled()
  } finally {
    release()
    await fixture.close()
  }
})
