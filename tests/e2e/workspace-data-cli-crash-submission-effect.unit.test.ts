import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'

const fixture = vi.hoisted(() => ({ clipboard: vi.fn(), submit: vi.fn() }))
vi.mock('electron', () => ({
  app: { getPath: () => 'unused', getVersion: () => 'fixture' },
  clipboard: { writeText: fixture.clipboard },
  ipcMain: { removeHandler: vi.fn(), handle: vi.fn(), removeAllListeners: vi.fn(), on: vi.fn() }
}))
vi.mock('../../src/main/ipc/feedback', () => ({ submitFeedback: fixture.submit }))
vi.mock('../../src/main/crash-reporting/crash-breadcrumb-store', () => ({
  getCrashBreadcrumbSnapshot: () => [],
  recordCoalescedCrashBreadcrumb: vi.fn(),
  recordCrashBreadcrumb: vi.fn()
}))
vi.mock('../../src/main/observability', () => ({
  collectDiagnosticBundle: vi.fn(),
  getDiagnosticsStatus: () => ({ enabled: false })
}))
vi.mock('../../src/main/observability/diagnostic-upload-endpoint', () => ({
  resolveDiagnosticOrcaChannel: () => 'fixture'
}))
vi.mock('../../src/main/observability/tracer', () => ({
  startSpan: () => ({
    setAttribute: vi.fn(),
    addEvent: vi.fn(),
    fail: vi.fn(),
    interrupt: vi.fn(),
    end: vi.fn()
  })
}))

import { CrashReportStore } from '../../src/main/crash-reporting/crash-report-store'
import {
  registerCrashReportingHandlers,
  _resetRendererErrorReportDedupeForTests
} from '../../src/main/ipc/crash-reporting'
import { WORKSPACE_CRASH_REPORT_HANDLERS } from '../../src/cli/handlers/workspace-crash-reports'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import {
  setCrashReportStoreForRpc,
  setCrashReportOperationsForRpc,
  WORKSPACE_CRASH_REPORT_METHODS
} from '../../src/main/runtime/rpc/methods/workspace-crash-reports'

let dir: string
let store: CrashReportStore
let ctx: HandlerContext
let reportId: string
async function input(value: unknown, confirm: string) {
  await writeFile(join(dir, 'input.json'), JSON.stringify(value))
  ctx.flags.set('params-file', 'input.json')
  ctx.flags.set('confirm', confirm)
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'orca-crash-submit-cli-'))
  store = new CrashReportStore(join(dir, 'crash-reports.json'))
  const report = await store.record({
    source: 'child',
    processType: 'GPU',
    reason: 'fixture',
    exitCode: 1,
    appVersion: 'fixture',
    platform: 'darwin',
    osRelease: 'fixture',
    arch: 'arm64',
    electronVersion: 'fixture',
    chromeVersion: 'fixture',
    details: { message: 'diagnostic-canary' }
  })
  reportId = report.id
  registerCrashReportingHandlers(store)
  fixture.submit.mockResolvedValue({ ok: true })
  fixture.clipboard.mockReset()
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(),
    methods: WORKSPACE_CRASH_REPORT_METHODS
  })
  const client = new RuntimeClient('fixture-unused')
  vi.spyOn(client, 'call').mockImplementation(async (method, params) => {
    const response = await dispatcher.dispatch({
      id: 'fixture',
      authToken: 'fixture',
      method,
      params
    })
    if (!response.ok) {
      throw new RuntimeClientError(response.error.code, response.error.message)
    }
    return response
  })
  ctx = { client, cwd: dir, json: true, flags: new Map() }
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(async () => {
  setCrashReportStoreForRpc(null)
  setCrashReportOperationsForRpc(null)
  _resetRendererErrorReportDedupeForTests()
  fixture.submit.mockReset()
  vi.restoreAllMocks()
  await rm(dir, { recursive: true, force: true })
})

it('copies through the installed desktop clipboard callback without diagnostic stdout', async () => {
  await input({ reportId, notes: 'notes-canary' }, 'host-clipboard')
  await WORKSPACE_CRASH_REPORT_HANDLERS['crash-report copy-diagnostics'](ctx)
  expect(fixture.clipboard).toHaveBeenCalledTimes(1)
  expect(fixture.clipboard.mock.calls[0][0]).toContain('diagnostic-canary')
  expect(fixture.clipboard.mock.calls[0][0]).toContain('notes-canary')
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toMatch(
    /diagnostic-canary|notes-canary/
  )
  expect(fixture.submit).not.toHaveBeenCalled()
  expect(await store.getById(reportId)).toMatchObject({ status: 'pending' })
})

it('keeps explicit uncaptured selection instead of substituting a pending report', async () => {
  await input({ notes: 'uncaptured-note' }, 'host-clipboard')
  await WORKSPACE_CRASH_REPORT_HANDLERS['crash-report copy-diagnostics'](ctx)
  expect(fixture.clipboard.mock.calls[0][0]).not.toContain('diagnostic-canary')
  expect(fixture.clipboard.mock.calls[0][0]).toContain('uncaptured-note')
})

it('requires clipboard confirmation and explicit upload consent before RPC', async () => {
  await input({ reportId }, 'wrong')
  await expect(
    WORKSPACE_CRASH_REPORT_HANDLERS['crash-report copy-diagnostics'](ctx)
  ).rejects.toMatchObject({ code: 'invalid_argument' })
  await input({ reportId, githubLogin: null, githubEmail: null }, reportId)
  await expect(WORKSPACE_CRASH_REPORT_HANDLERS['crash-report submit'](ctx)).rejects.toMatchObject({
    code: 'invalid_argument'
  })
  expect(ctx.client.call).not.toHaveBeenCalled()
  expect(fixture.clipboard).not.toHaveBeenCalled()
  expect(fixture.submit).not.toHaveBeenCalled()
})

it('uses the existing upload pipeline, persists sent and suppresses duplicate sends', async () => {
  await input(
    {
      reportId,
      notes: 'notes-canary',
      includeDiagnosticLogs: false,
      submitAnonymously: true,
      githubLogin: null,
      githubEmail: null
    },
    reportId
  )
  await WORKSPACE_CRASH_REPORT_HANDLERS['crash-report submit'](ctx)
  expect(fixture.submit).toHaveBeenCalledTimes(1)
  expect(fixture.submit.mock.calls[0][0]).toMatchObject({
    submissionType: 'crash',
    submitAnonymously: true,
    githubLogin: null,
    githubEmail: null
  })
  expect(fixture.submit.mock.calls[0][0].feedback).toContain('diagnostic-canary')
  expect(await store.getById(reportId)).toMatchObject({ status: 'sent' })
  await WORKSPACE_CRASH_REPORT_HANDLERS['crash-report submit'](ctx)
  expect(fixture.submit).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toMatch(
    /diagnostic-canary|notes-canary/
  )
  expect(
    JSON.parse(await readFile(join(dir, 'crash-reports.json'), 'utf8')).reports[0].status
  ).toBe('sent')
})

it('fails without success output on clipboard and upload errors', async () => {
  await input({ reportId }, 'host-clipboard')
  fixture.clipboard.mockImplementation(() => {
    throw new Error('private-error-canary')
  })
  await expect(
    WORKSPACE_CRASH_REPORT_HANDLERS['crash-report copy-diagnostics'](ctx)
  ).rejects.toMatchObject({ message: 'Could not copy crash diagnostics.' })
  await input(
    {
      reportId,
      includeDiagnosticLogs: false,
      submitAnonymously: true,
      githubLogin: null,
      githubEmail: null
    },
    reportId
  )
  fixture.submit.mockResolvedValue({ ok: false, error: 'private-error-canary', status: 500 })
  await expect(WORKSPACE_CRASH_REPORT_HANDLERS['crash-report submit'](ctx)).rejects.toMatchObject({
    code: 'operation_failed'
  })
  expect(await store.getById(reportId)).toMatchObject({ status: 'pending' })
  expect(console.log).not.toHaveBeenCalled()
})

it('fails on a Node host without operations and on an old peer without a client clipboard fallback', async () => {
  await input({}, 'host-clipboard')
  setCrashReportOperationsForRpc(null)
  await expect(
    WORKSPACE_CRASH_REPORT_HANDLERS['crash-report copy-diagnostics'](ctx)
  ).rejects.toMatchObject({ code: 'runtime_unavailable' })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'old host')
  )
  await expect(
    WORKSPACE_CRASH_REPORT_HANDLERS['crash-report copy-diagnostics'](ctx)
  ).rejects.toMatchObject({ code: 'method_not_found' })
  expect(ctx.client.call).toHaveBeenCalledTimes(2)
  expect(fixture.clipboard).not.toHaveBeenCalled()
  expect(fixture.submit).not.toHaveBeenCalled()
})
