import { expect, it } from 'vitest'
import { WorkspaceBoardParams } from './workspace-board-params'

it('accepts only explicit board operations for the host viewer', () => {
  for (const command of [
    { operation: 'get' },
    { operation: 'status-add' },
    { operation: 'status-rename', statusId: 'in-review', label: ' QA ' },
    { operation: 'status-color', statusId: 'in-review', color: 'conductor-review' },
    { operation: 'status-icon', statusId: 'in-review', icon: 'git-pull-request' },
    { operation: 'status-move', statusId: 'in-review', direction: 'left' },
    { operation: 'status-remove', statusId: 'in-review' },
    { operation: 'column-width', width: 220 },
    { operation: 'column-width', width: 520 }
  ]) {
    expect(WorkspaceBoardParams.safeParse({ viewer: 'host', ...command }).success).toBe(true)
  }
  for (const command of [
    { operation: 'get' },
    { viewer: 'peer', operation: 'get' },
    { viewer: 'host', operation: 'get', statusId: 'x' },
    { viewer: 'host', operation: 'status-add', label: 'extra' },
    { viewer: 'host', operation: 'status-rename', statusId: 'a' },
    { viewer: 'host', operation: 'status-rename', statusId: 'a', label: '   ' },
    { viewer: 'host', operation: 'status-rename', statusId: 'a', label: 'a\u0000b' },
    { viewer: 'host', operation: 'status-rename', statusId: 'a', label: 'a\nb' },
    { viewer: 'host', operation: 'status-rename', statusId: '', label: 'x' },
    { viewer: 'host', operation: 'status-color', statusId: 'a', color: '#ff0000' },
    { viewer: 'host', operation: 'status-icon', statusId: 'a', icon: 'skull' },
    { viewer: 'host', operation: 'status-move', statusId: 'a', direction: 'up' },
    { viewer: 'host', operation: 'status-remove' },
    { viewer: 'host', operation: 'column-width', width: 219 },
    { viewer: 'host', operation: 'column-width', width: 521 },
    { viewer: 'host', operation: 'column-width', width: 300.5 },
    { viewer: 'host', operation: 'column-width', width: Number.NaN }
  ]) {
    expect(WorkspaceBoardParams.safeParse(command).success).toBe(false)
  }
})
