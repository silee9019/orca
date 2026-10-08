import { describe, expect, it } from 'vitest'
import {
  SESSION_HISTORY_LIMIT,
  historyAfterSwitch,
  historyBack,
  type SessionHistory,
  type SessionTarget
} from './session-switch-history'

const s = (id: string): SessionTarget => ({ worktreeId: id, name: id })

describe('session switch history', () => {
  it('records the session being left', () => {
    expect(historyAfterSwitch([], s('a'), s('b'))).toEqual([s('a')])
  })

  it('never repeats a session when switching back and forth', () => {
    let history: SessionHistory = []
    let current = s('a')
    for (const next of ['b', 'a', 'b', 'a']) {
      history = historyAfterSwitch(history, current, s(next))
      current = s(next)
    }
    expect(history.map((e) => e.worktreeId)).toEqual(['b'])
  })

  it('drops the target from the history when it is revisited', () => {
    const history = historyAfterSwitch([s('a'), s('b')], s('c'), s('a'))
    expect(history.map((e) => e.worktreeId)).toEqual(['b', 'c'])
  })

  it('caps the history and drops the oldest', () => {
    let history: SessionHistory = []
    for (let i = 0; i < SESSION_HISTORY_LIMIT + 5; i += 1) {
      history = historyAfterSwitch(history, s(`s${i}`), s(`s${i + 1}`))
    }
    expect(history).toHaveLength(SESSION_HISTORY_LIMIT)
    expect(history[0].worktreeId).toBe('s5')
    expect(history.at(-1)?.worktreeId).toBe(`s${SESSION_HISTORY_LIMIT + 4}`)
  })

  it('goes back in reverse visiting order and then reports empty', () => {
    let history = historyAfterSwitch([], s('a'), s('b'))
    history = historyAfterSwitch(history, s('b'), s('c'))
    const first = historyBack(history)
    expect(first?.target.worktreeId).toBe('b')
    const second = historyBack(first?.history ?? [])
    expect(second?.target.worktreeId).toBe('a')
    expect(historyBack(second?.history ?? [])).toBeNull()
  })
})
