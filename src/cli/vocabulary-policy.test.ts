import { describe, expect, it } from 'vitest'

import { findCommandSpec, type CommandSpec } from './args'
import { COMMAND_SPECS } from './specs'
import { findVocabularyViolations } from './vocabulary-policy'

const spec = (path: string[], aliases?: string[][]): CommandSpec => ({
  path,
  aliases,
  summary: 's',
  usage: 'u',
  allowedFlags: []
})

describe('vocabulary policy (live tree)', () => {
  it('has no off-policy verbs that are not grandfathered or alias-bridged', () => {
    expect(findVocabularyViolations(COMMAND_SPECS)).toEqual([])
  })
})

describe('findVocabularyViolations (fixtures)', () => {
  it('flags a new deletion command using an off-policy verb', () => {
    const violations = findVocabularyViolations([spec(['gadget', 'delete'])])
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({ command: 'gadget delete', canonical: 'rm' })
  })

  it('passes a deletion command that bridges to the canonical verb via an alias', () => {
    const violations = findVocabularyViolations([spec(['gadget', 'delete'], [['gadget', 'rm']])])
    expect(violations).toEqual([])
  })

  it('rejects a canonical verb alias under an unrelated command prefix', () => {
    const violations = findVocabularyViolations([spec(['gadget', 'delete'], [['other', 'rm']])])
    expect(violations).toHaveLength(1)
  })

  it('rejects a canonical verb alias at a different command depth', () => {
    const violations = findVocabularyViolations([
      spec(['gadget', 'delete'], [['gadget', 'nested', 'rm']])
    ])
    expect(violations).toHaveLength(1)
  })

  it('passes the canonical deletion verb outright', () => {
    expect(findVocabularyViolations([spec(['gadget', 'rm'])])).toEqual([])
  })

  it('flags a new single-item read using get instead of show', () => {
    const violations = findVocabularyViolations([spec(['gadget', 'get'])])
    expect(violations[0]).toMatchObject({ verb: 'get', canonical: 'show' })
  })
})

describe('integrated command vocabulary aliases', () => {
  it.each([
    ['agent history delete', 'agent history rm'],
    ['app cli remove', 'app cli rm'],
    ['app diagnostics delete', 'app diagnostics rm'],
    ['app onboarding get', 'app onboarding show'],
    ['file delete', 'file rm'],
    ['folder-workspace delete', 'folder-workspace rm'],
    ['linear project get', 'linear project show'],
    ['plugins marketplace remove', 'plugins marketplace rm'],
    ['plugins preferences get', 'plugins preferences show'],
    ['plugins remove', 'plugins rm'],
    ['project-group delete', 'project-group rm'],
    ['rate-limit get', 'rate-limit show'],
    ['settings desktop get', 'settings desktop show'],
    ['settings get', 'settings show'],
    ['settings keybindings get', 'settings keybindings show'],
    ['skills delete', 'skills rm'],
    ['sparse-presets remove', 'sparse-presets rm'],
    ['ui card get', 'ui card show'],
    ['ui project-filter get', 'ui project-filter show'],
    ['ui project-filter remove', 'ui project-filter rm'],
    ['ui sidebar get', 'ui sidebar show'],
    ['ui status-bar get', 'ui status-bar show'],
    ['ui workspace-filter get', 'ui workspace-filter show'],
    ['ui workspace-list get', 'ui workspace-list show']
  ])('%s exposes %s without changing its target', (command, alias) => {
    const target = findCommandSpec(COMMAND_SPECS, command.split(' '))
    if (!target) {
      throw new Error(`Missing registered command: ${command}`)
    }
    expect(findCommandSpec(COMMAND_SPECS, alias.split(' '))).toBe(target)
    expect(findVocabularyViolations([target])).toEqual([])
    expect(
      COMMAND_SPECS.filter((entry) =>
        [entry.path, ...(entry.aliases ?? [])].some((path) => path.join(' ') === alias)
      )
    ).toHaveLength(1)
  })
})
