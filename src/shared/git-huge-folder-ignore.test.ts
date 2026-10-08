import { expect, it } from 'vitest'
import { hugeFolderGitignoreAddition } from './git-huge-folder-ignore'

it('only appends allowlisted folder patterns with a safe line boundary and skips existing patterns', () => {
  expect(hugeFolderGitignoreAddition('node_modules', '')).toBe('node_modules/\n')
  expect(hugeFolderGitignoreAddition('dist', 'keep')).toBe('\ndist/\n')
  expect(hugeFolderGitignoreAddition('dist', 'dist/\r\n')).toBeNull()
  expect(() => hugeFolderGitignoreAddition('../outside', '')).toThrow()
  expect(() => hugeFolderGitignoreAddition('dist\ninjected', '')).toThrow()
})
