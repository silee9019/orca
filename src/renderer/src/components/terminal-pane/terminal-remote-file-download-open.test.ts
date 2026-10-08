import { afterEach, expect, it, vi } from 'vitest'
import { downloadAndOpenRemoteTerminalFile } from './terminal-remote-file-download-open'

vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, text: string) => text }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/runtime/runtime-file-client', () => ({ downloadRuntimeFile: vi.fn() }))
afterEach(() => vi.unstubAllGlobals())

it('returns the OS owner receipt only after a successful remote download', async () => {
  const downloadFile = vi.fn().mockResolvedValue({ canceled: true, destinationPath: '' })
  const openFilePath = vi.fn().mockResolvedValue(true)
  vi.stubGlobal('window', { api: { fs: { downloadFile }, shell: { openFilePath } } })
  const context = {
    settings: null,
    worktreeId: 'folder:docs',
    worktreePath: '/docs',
    connectionId: 'ssh-1'
  }
  await expect(downloadAndOpenRemoteTerminalFile(context, '/docs/index.html')).resolves.toBe(false)
  expect(openFilePath).not.toHaveBeenCalled()
  downloadFile.mockResolvedValue({ canceled: false, destinationPath: '/fixture/index.html' })
  openFilePath.mockResolvedValueOnce(false)
  await expect(downloadAndOpenRemoteTerminalFile(context, '/docs/index.html')).resolves.toBe(false)
  await expect(downloadAndOpenRemoteTerminalFile(context, '/docs/index.html')).resolves.toBe(true)
  expect(downloadFile).toHaveBeenLastCalledWith({
    filePath: '/docs/index.html',
    connectionId: 'ssh-1'
  })
  expect(openFilePath).toHaveBeenLastCalledWith('/fixture/index.html')
  downloadFile.mockRejectedValueOnce(new Error('unverifiable'))
  await expect(downloadAndOpenRemoteTerminalFile(context, '/docs/index.html')).resolves.toBe(false)
})
