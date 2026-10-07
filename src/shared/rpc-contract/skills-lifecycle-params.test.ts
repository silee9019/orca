import { describe, expect, it } from 'vitest'
import { SkillUpdateStartParams } from './skills-lifecycle-params'

describe('CLI targeted skill update names', () => {
  it('preserves the existing updater grammar and rejects shell syntax', () => {
    expect(
      SkillUpdateStartParams.parse({ names: ['fixture.skill', 'fixture_skill', 'fixture-skill'] })
        .names
    ).toHaveLength(3)
    for (const name of ['-flag', 'fixture;other', 'fixture\nother', '$(command)']) {
      expect(SkillUpdateStartParams.safeParse({ names: [name] }).success).toBe(false)
    }
    expect(SkillUpdateStartParams.safeParse({ names: ['fixture'], command: 'other' }).success).toBe(
      false
    )
  })
})
