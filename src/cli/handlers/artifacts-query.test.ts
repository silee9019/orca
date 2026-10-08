import { afterEach, expect, it, vi } from 'vitest'
import { ARTIFACT_HANDLERS } from './artifacts'
import { RuntimeClient } from '../runtime-client'
import type { ArtifactListItem } from '../../shared/artifacts'

function item(slug: string, title: string): ArtifactListItem {
  return {
    artifact: {
      version: 1,
      slug,
      title,
      originalFileName: `${slug}.html`,
      sourceContentType: 'text/html',
      renderedContentType: 'text/html',
      createdAt: '2026-10-08T00:00:00Z',
      updatedAt: '2026-10-08T00:00:00Z',
      expiresAt: '2026-11-08T00:00:00Z',
      byteSize: 12,
      deletedAt: null
    },
    shareUrl: `https://example.invalid/a/${slug}`
  }
}

afterEach(() => vi.restoreAllMocks())

it('filters the requested page by query and exact slug while retaining its continuation', async () => {
  const client = new RuntimeClient('/unused-artifacts-query-fixture')
  const artifacts = [item('first', '분기 보고서'), item('second', '분기 보고서 사본')]
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'query',
    ok: true,
    result: { status: 'ok', value: { artifacts, nextCursor: 'page-3' } },
    _meta: { runtimeId: 'fixture' }
  })
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  await ARTIFACT_HANDLERS['artifacts list']!({
    client,
    cwd: '/folder',
    json: true,
    flags: new Map([
      ['query', '  분기 보고서 '],
      ['id', 'first'],
      ['cursor', 'page-2']
    ])
  })
  expect(call).toHaveBeenCalledExactlyOnceWith('artifacts.list', { cursor: 'page-2' })
  expect(JSON.parse(String(log.mock.calls[0]?.[0])).result).toEqual({
    artifacts: [artifacts[0]],
    nextCursor: 'page-3'
  })
  expect(artifacts).toHaveLength(2)
})

it.each(['x'.repeat(2049), '가'.repeat(700), ' '.repeat(2049)])(
  'rejects oversized queries before RPC',
  async (query) => {
    const client = new RuntimeClient('/unused-artifacts-query-fixture')
    const call = vi.spyOn(client, 'call')
    await expect(
      ARTIFACT_HANDLERS['artifacts list']!({
        client,
        cwd: '/folder',
        json: true,
        flags: new Map([['query', query]])
      })
    ).rejects.toMatchObject({ code: 'invalid_argument' })
    expect(call).not.toHaveBeenCalled()
  }
)
