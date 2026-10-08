import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const mocks = vi.hoisted(() => ({
  callMock: vi.fn(),
  runtimeClientConstructorMock: vi.fn(),
  serveOrcaAppMock: vi.fn(),
  getDefaultUserDataPathMock: vi.fn(),
  resolveEnvironment: vi.fn()
}))
vi.mock('./runtime-client', async () => {
  const { createRuntimeClientModuleMock } = await import('./index-test-harness.js')
  return createRuntimeClientModuleMock(mocks)
})
vi.mock('./runtime/environments', () => ({
  resolveEnvironment: mocks.resolveEnvironment,
  listEnvironments: vi.fn(),
  addEnvironmentFromPairingCode: vi.fn(),
  removeEnvironment: vi.fn()
}))
import { main } from './index'
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  process.exitCode = 0
})
it('pins ambient routing to the desktop and rejects explicit environment selectors before lookup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orca-sidebar-routing-'))
  const input = join(root, 'request.json')
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  vi.stubEnv('ORCA_ENVIRONMENT', 'ambient-remote')
  vi.stubEnv('ORCA_PAIRING_CODE', 'ambient-pair')
  mocks.callMock.mockResolvedValue({ activeView: 'terminal' })
  try {
    await writeFile(input, JSON.stringify({ viewer: 'desktop', action: { kind: 'get' } }))
    await main(['extensions', 'sidebar', '--input-file', input, '--json'], root)
    expect(mocks.runtimeClientConstructorMock).toHaveBeenCalledExactlyOnceWith(null, null)
    expect(mocks.callMock).toHaveBeenCalledExactlyOnceWith('extensions.sidebarAction', {
      viewer: 'desktop',
      action: { kind: 'get' }
    })
    mocks.callMock.mockClear()
    mocks.runtimeClientConstructorMock.mockClear()
    await main(
      ['extensions', 'sidebar', '--input-file', input, '--environment', 'missing-remote', '--json'],
      root
    )
    expect(mocks.resolveEnvironment).not.toHaveBeenCalled()
    expect(mocks.runtimeClientConstructorMock).not.toHaveBeenCalled()
    expect(mocks.callMock).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
