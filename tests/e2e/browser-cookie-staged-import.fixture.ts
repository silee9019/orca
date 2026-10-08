import { vi } from 'vitest'

// These tests drive the browser import commands through fake cookie providers and never run the
// SQLite merge; stubbing it keeps node:sqlite out of the happy-dom module graph.
export function browserCookieStagedImportStub() {
  return {
    SCOPED_COOKIE_IMPORT_FORMAT: 'scoped-v1',
    applyScopedStagedCookieImport: vi.fn(() => false),
    isScopedStagedCookieImport: vi.fn(() => false),
    removeCookieImportScopeMarker: vi.fn(),
    prepareStagedCookiesForImport: vi.fn()
  }
}
