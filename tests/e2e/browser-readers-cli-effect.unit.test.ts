import { expect, it, vi } from 'vitest'
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { getRuntimeBrowserPageRegistry } from '../../src/main/runtime/runtime-browser-page-registry'
import { browserReaderMethods } from '../../src/main/runtime/rpc/methods/browser-readers'
import { createRemotePaneCliSocket } from './browser-remote-pane-cli-socket.test-fixture'
it('reads complete authoritative snapshots through parser/socket/RPC and sees subsequent provider changes', async () => {
  const runtime = new OrcaRuntimeService()
  const pages = getRuntimeBrowserPageRegistry(runtime)
  runtime.reclaimBrowserForDesktop('desktop-a')
  runtime.reclaimBrowserForDesktop('desktop-b')
  for (const [page, workspace] of [
    ['page-a', 'folder:fixture'],
    ['page-b', 'repo::fixture']
  ]) {
    pages.publishClientPage({
      browserPageId: page,
      workspaceId: workspace,
      browserProfileId: 'default',
      executionHostKey: 'native:fixture:0',
      placement: {
        kind: 'client',
        browserHostClientId: 'fixture-client',
        browserHostGeneration: 1,
        pageHostGeneration: 1
      },
      url: `https://kagi.com/search?token=FIXTURE_SECRET&q=${page}`,
      title: `https://kagi.com/search?token=FIXTURE_SECRET&q=${page}`,
      loading: true,
      active: false
    })
  }
  const cli = await createRemotePaneCliSocket(runtime, browserReaderMethods)
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    await cli.runBrowserReader('browser-drivers')
    expect(output.mock.lastCall?.[0]).toContain('desktop-a')
    expect(output.mock.lastCall?.[0]).toContain('desktop-b')
    await cli.runBrowserReader('client-browser-rows')
    expect(output.mock.lastCall?.[0]).toContain('folder:fixture')
    expect(output.mock.lastCall?.[0]).toContain('repo::fixture')
    expect(output.mock.lastCall?.[0]).toContain('"hostAbsent": true')
    expect(output.mock.lastCall?.[0]).toContain('"loading": false')
    expect(output.mock.lastCall?.[0]).not.toContain('FIXTURE_SECRET')
    const page = pages.getPage('page-a')
    if (!page) {
      throw new Error('missing fixture page')
    }
    pages.retirePage('page-a', page.placement)
    await cli.runBrowserReader('client-browser-rows')
    expect(output.mock.lastCall?.[0]).not.toContain('page-a')
    expect(output.mock.lastCall?.[0]).toContain('page-b')
    cli.useLegacyPeer()
    await expect(cli.runBrowserReader('browser-drivers')).rejects.toThrow(
      'does not support complete browser'
    )
    await expect(cli.runBrowserReader('client-browser-rows')).rejects.toThrow(
      'does not support complete browser'
    )
  } finally {
    await cli.close()
    vi.restoreAllMocks()
  }
})
