// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { INSTALLED_AGENT_SKILLS_CHANGED_EVENT } from '@/hooks/installed-agent-skills-change-event'
import { FeatureSetupInlineTerminal } from './FeatureSetupInlineTerminal'

type TerminalProps = {
  command: string
  forceHostRuntime?: boolean
  prepareCommandForShell?: (command: string, shellOverride?: string) => string
  shellOverride?: string
  onTerminalExit?: () => void
}
const mocks = vi.hoisted(() => {
  const runtime: {
    agentRuntime: { runtime: 'wsl'; wslDistro: string; label: string }
    installDisabledReason: string | null
    terminalShellOverride: string
  } = {
    agentRuntime: { runtime: 'wsl', wslDistro: 'Ubuntu', label: 'WSL Ubuntu' },
    installDisabledReason: null,
    terminalShellOverride: 'powershell.exe'
  }
  const terminal: { props: TerminalProps | null } = { props: null }
  return {
    runtime,
    terminal,
    buildCommand: vi.fn(
      (command: string, runtime?: { runtime: 'host' | 'wsl' }) =>
        `${runtime?.runtime ?? 'host'}:${command}`
    ),
    buildSetupCommand: vi.fn(
      (command: string, shellOverride: string | undefined, runtime?: { runtime: 'host' | 'wsl' }) =>
        `${runtime?.runtime ?? 'host'}-${shellOverride ?? 'default'}:${command}`
    )
  }
})

vi.mock('@/hooks/useActiveProjectSkillRuntime', () => ({
  useActiveProjectSkillRuntime: () => mocks.runtime
}))

vi.mock('../settings/CliSkillRuntimeSetup', () => ({
  buildSkillCommandForRuntime: mocks.buildCommand,
  buildSkillSetupTerminalCommand: mocks.buildSetupCommand
}))

vi.mock('./OnboardingInlineCommandTerminal', () => ({
  OnboardingInlineCommandTerminal: (props: {
    command: string
    forceHostRuntime?: boolean
    prepareCommandForShell?: (command: string, shellOverride?: string) => string
    shellOverride?: string
    onTerminalExit?: () => void
  }) => {
    mocks.terminal.props = props
    return null
  }
}))

const SELECTION = {
  browserUse: false,
  computerUse: false,
  orchestration: true,
  linearTickets: false
}

describe('FeatureSetupInlineTerminal', () => {
  beforeEach(() => {
    mocks.runtime.installDisabledReason = null
    mocks.terminal.props = null
    mocks.buildCommand.mockClear()
    mocks.buildSetupCommand.mockClear()
  })

  it('runs the command through the resolved WSL runtime', () => {
    render(
      <FeatureSetupInlineTerminal command="npx skills add orchestration" selection={SELECTION} />
    )

    expect(mocks.buildCommand).toHaveBeenCalledWith('npx skills add orchestration', {
      runtime: 'wsl',
      wslDistro: 'Ubuntu',
      label: 'WSL Ubuntu'
    })
    expect(mocks.terminal.props).toMatchObject({
      command: 'wsl:npx skills add orchestration',
      forceHostRuntime: false,
      shellOverride: 'powershell.exe'
    })
    expect(
      mocks.terminal.props?.prepareCommandForShell?.('wsl:npx skills add orchestration', 'wsl.exe')
    ).toBe('wsl-wsl.exe:wsl:npx skills add orchestration')
  })

  it('uses the host command builder when the WSL runtime needs repair', () => {
    mocks.runtime.installDisabledReason = 'The selected WSL distro is unavailable.'

    render(
      <FeatureSetupInlineTerminal command="npx skills add orchestration" selection={SELECTION} />
    )

    expect(mocks.buildCommand).toHaveBeenCalledWith('npx skills add orchestration', undefined)
    expect(mocks.terminal.props).toMatchObject({
      command: 'host:npx skills add orchestration',
      forceHostRuntime: true,
      shellOverride: 'powershell.exe'
    })
    expect(
      mocks.terminal.props?.prepareCommandForShell?.('host:npx skills add orchestration', 'wsl.exe')
    ).toBe('host-wsl.exe:host:npx skills add orchestration')
  })

  it('keeps the runtime captured when setup started', () => {
    render(
      <FeatureSetupInlineTerminal
        command="npx skills add orchestration"
        runtimeContext={{
          agentRuntime: { runtime: 'host', label: 'Windows' },
          installDisabledReason: null,
          terminalShellOverride: 'cmd.exe'
        }}
        selection={SELECTION}
      />
    )

    expect(mocks.buildCommand).toHaveBeenCalledWith('npx skills add orchestration', {
      runtime: 'host',
      label: 'Windows'
    })
    expect(mocks.terminal.props).toMatchObject({
      command: 'host:npx skills add orchestration',
      shellOverride: 'cmd.exe'
    })
    expect(
      mocks.terminal.props?.prepareCommandForShell?.('host:npx skills add orchestration', 'cmd.exe')
    ).toBe('host-cmd.exe:host:npx skills add orchestration')
  })
})

it('invalidates installed skill discovery after the actual inline terminal exit callback', () => {
  const changed = vi.fn()
  window.addEventListener(INSTALLED_AGENT_SKILLS_CHANGED_EVENT, changed)
  try {
    render(<FeatureSetupInlineTerminal command="reviewed install command" selection={SELECTION} />)
    expect(changed).not.toHaveBeenCalled()
    expect(mocks.terminal.props?.onTerminalExit).toBeTypeOf('function')
    mocks.terminal.props?.onTerminalExit?.()
    expect(changed).toHaveBeenCalledOnce()
  } finally {
    window.removeEventListener(INSTALLED_AGENT_SKILLS_CHANGED_EVENT, changed)
  }
})
