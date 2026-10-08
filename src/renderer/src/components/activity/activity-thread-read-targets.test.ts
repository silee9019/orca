import { expect, it } from 'vitest'
import { getActivityThreadReadTargets } from './activity-thread-read-targets'

it('gives unread targets priority in a mixed selection and preserves their identity', () => {
  const targets = [
    { paneKey: 'unread', unread: true },
    { paneKey: 'protected-read', unread: false },
    { paneKey: 'read', unread: false }
  ]
  const action = getActivityThreadReadTargets(
    targets,
    (thread) => thread.paneKey !== 'protected-read'
  )
  expect(action).toEqual({ operation: 'read', targets: [targets[0]] })
  expect(action.targets[0]).toBe(targets[0])
  expect(targets.map((thread) => thread.unread)).toEqual([true, false, false])
})
it('toggles only eligible read targets when the whole selection is read', () => {
  const targets = [
    { paneKey: 'protected', unread: false },
    { paneKey: 'eligible', unread: false }
  ]
  expect(getActivityThreadReadTargets(targets, (thread) => thread.paneKey !== 'protected')).toEqual(
    { operation: 'unread', targets: [targets[1]] }
  )
  expect(getActivityThreadReadTargets(targets, () => false)).toEqual({
    operation: 'unread',
    targets: []
  })
})
