import { expect, it } from 'vitest'
import { getSectionHeaderCollapseKey } from './section-header-collapse-key'

it('uses the explicit collapse key before the row key', () => {
  expect(getSectionHeaderCollapseKey({ key: 'pinned', collapseKey: 'host:a:pinned' })).toBe(
    'host:a:pinned'
  )
  expect(getSectionHeaderCollapseKey({ key: 'repo:one' })).toBe('repo:one')
})
