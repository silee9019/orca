import { useCallback, useRef, useState } from 'react'
import { useMountedRef } from '@/hooks/useMountedRef'
import type { SkillTerminalSnapshot } from './agent-skill-terminal-snapshot'
import { recheckSurfacesAfterAgentSkillTerminal } from './agent-skill-recheck-surface-sync'
type Options = {
  snapshot: () => SkillTerminalSnapshot
  beforeOpen?: () => void | Promise<void>
  refreshNotice: () => Promise<void>
  onRecheck: () => void | Promise<unknown>
  freshnessSkillName?: string
}
export function useAgentSkillSetupTerminal(options: Options) {
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalSnapshot, setTerminalSnapshot] = useState<SkillTerminalSnapshot | null>(null)
  const [terminalAttempt, setTerminalAttempt] = useState(0)
  const [terminalOpening, setTerminalOpening] = useState(false)
  const [setupAttemptRunning, setSetupAttemptRunning] = useState(false)
  const [setupCommandFailedCode, setSetupCommandFailedCode] = useState<number | null>(null)
  const opening = useRef(false)
  const running = useRef(false)
  const mounted = useMountedRef()
  const openTerminal = async (isCurrent: () => boolean): Promise<boolean> => {
    if (opening.current || running.current || !isCurrent()) {
      return false
    }
    const snapshot = options.snapshot()
    opening.current = true
    setTerminalOpening(true)
    if (setupCommandFailedCode !== null) {
      setTerminalOpen(false)
    }
    let prepared = false
    try {
      await options.beforeOpen?.()
      if (isCurrent()) {
        await options.refreshNotice()
        prepared = true
      }
    } catch {
      prepared = false
    } finally {
      opening.current = false
      if (mounted.current) {
        setTerminalOpening(false)
      }
    }
    if (!prepared || !mounted.current || !isCurrent()) {
      return false
    }
    setTerminalSnapshot(snapshot)
    setTerminalAttempt((attempt) => attempt + 1)
    setTerminalOpen(true)
    running.current = true
    setSetupAttemptRunning(true)
    return true
  }
  const openSetupTerminal = (): void => {
    void openTerminal(() => true)
  }
  // OSC 133;D reports the command status; PTY exit reports the shell status.
  const handleSetupCommandFinished = useCallback(
    (exitCode: number | null): void => {
      if (!running.current) {
        return
      }
      running.current = false
      setSetupAttemptRunning(false)
      if (exitCode !== null) {
        setSetupCommandFailedCode(exitCode === 0 ? null : exitCode)
      }
      recheckSurfacesAfterAgentSkillTerminal(options.onRecheck, options.freshnessSkillName)
    },
    [options.onRecheck, options.freshnessSkillName]
  )
  const handleTerminalExit = useCallback((): void => {
    const shouldRecheck = running.current
    if (mounted.current) {
      running.current = false
      setTerminalOpen(false)
      setSetupAttemptRunning(false)
    }
    if (shouldRecheck) {
      recheckSurfacesAfterAgentSkillTerminal(options.onRecheck, options.freshnessSkillName)
    }
  }, [mounted, options.onRecheck, options.freshnessSkillName])
  return {
    terminalOpen,
    terminalSnapshot,
    terminalAttempt,
    terminalOpening,
    setupAttemptRunning,
    setupCommandFailedCode,
    openSetupTerminal,
    openTerminal,
    handleSetupCommandFinished,
    handleTerminalExit
  }
}
