import { afterEach, expect, it, vi } from 'vitest'
import { RuntimeClient } from './runtime-client'
import { okFixture } from './test-fixtures'
import { runBrowserToolbarCookieImport } from './handlers/browser-toolbar-cookie-import'

afterEach(() => vi.restoreAllMocks())
const state = {
  cookieImportTargetGuard: 1,
  workspace: 'tab',
  profile: 'default',
  partition: null,
  menuOpen: false,
  pendingProfile: null,
  newDialogOpen: false,
  newName: '',
  creating: false,
  guestRegistrationVerified: false,
  cookieImport: {
    profile: 'default',
    imported: 1,
    skipped: 0,
    total: 1,
    executionHost: 'local',
    executionMachine: 'client'
  }
}
async function readReply(result: unknown, expectedCalls?: number) {
  const client = new RuntimeClient('/unused-fixture', 1000, null, null)
  const response = {
    ...okFixture('reply', result),
    privateEnvelope: 'private-envelope',
    _meta: { runtimeId: 'runtime-1', privateMetadata: 'private-meta' }
  }
  const call = vi.spyOn(client, 'call').mockResolvedValue(response)
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    await runBrowserToolbarCookieImport({
      client,
      cwd: '/fixture',
      json: true,
      flags: new Map<string, string | boolean>([
        ['viewer', 'host'],
        ['page', 'page'],
        ['profile', 'default'],
        ['action', 'import-file'],
        ['file', 'cookies.json'],
        ['confirm', true]
      ])
    })
  } finally {
    if (expectedCalls !== undefined) {
      expect(call).toHaveBeenCalledTimes(expectedCalls)
    }
  }
  return { text: output.mock.calls.flat().join(' '), call }
}
it('projects the public envelope and count receipt while resolving the explicit file from CLI cwd', async () => {
  const { text, call } = await readReply({
    applied: true,
    privateResult: 'private-result',
    profileUi: {
      ...state,
      privateState: 'private-state',
      cookieImport: { ...state.cookieImport, cookies: 'private-cookie' }
    }
  })
  expect(JSON.parse(text)).toEqual({
    id: 'reply',
    ok: true,
    _meta: { runtimeId: 'runtime-1' },
    result: { applied: true, profileUi: state }
  })
  expect(text).not.toContain('private-')
  expect(call).toHaveBeenCalledWith(
    'ui.browserViewer',
    expect.objectContaining({
      command: expect.objectContaining({
        filePath: expect.stringContaining('fixture'),
        profile: 'default'
      })
    })
  )
})
it.each([
  null,
  undefined,
  {},
  { applied: false, profileUi: state },
  { applied: true, profileUi: null },
  { applied: true, profileUi: { ...state, cookieImportTargetGuard: undefined } },
  { applied: true, profileUi: { ...state, cookieImport: undefined } },
  {
    applied: true,
    profileUi: { ...state, cookieImport: { ...state.cookieImport, profile: 'other' } }
  },
  { applied: true, profileUi: { ...state, cookieImport: { ...state.cookieImport, imported: -1 } } }
])('rejects malformed or wrong-target receipt without output: %j', async (result) => {
  await expect(readReply(result)).rejects.toMatchObject({ code: 'runtime_error' })
  expect(vi.mocked(console.log)).not.toHaveBeenCalled()
})

it('refuses a peer without the target guard before sending an import operation', async () => {
  await expect(
    readReply({ applied: true, profileUi: { ...state, cookieImportTargetGuard: undefined } }, 1)
  ).rejects.toMatchObject({ code: 'runtime_error' })
  expect(vi.mocked(console.log)).not.toHaveBeenCalled()
})
