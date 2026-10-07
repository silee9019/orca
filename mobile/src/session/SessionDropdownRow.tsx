import { memo } from 'react'
import { Pin } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { AgentSpinner } from '../components/AgentSpinner'
import { MobileRepoIcon } from '../components/MobileRepoIcon'
import { colors, spacing, typography } from '../theme/mobile-theme'
import { repoColor } from '../worktree/repo-color'
import { getWorktreeStatus } from '../worktree/workspace-list-ordering'
import type { Worktree } from '../worktree/workspace-list-sections'

function displayBranch(branch: string): string {
  return branch.replace(/^refs\/heads\//, '')
}

type Props = {
  item: Worktree
  pinned: boolean
  current: boolean
  onPress: (item: Worktree) => void
}

/** One flat dropdown row: status, name, branch, a small project mark and a pin mark when pinned. */
function SessionDropdownRowComponent({ item, pinned, current, onPress }: Props) {
  const name = item.displayName || item.repo
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        current && styles.rowCurrent,
        pressed && styles.rowPressed
      ]}
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${item.repo}${pinned ? ', pinned' : ''}`}
      accessibilityState={{ selected: current }}
    >
      <View style={styles.indicator}>
        <AgentSpinner status={getWorktreeStatus(item)} workingMode={item.workingMode} />
      </View>
      <View style={styles.main}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.metaRow}>
          <MobileRepoIcon repoIcon={null} size={11} color={repoColor(item.repo)} />
          <Text style={styles.branch} numberOfLines={1}>
            {displayBranch(item.branch)}
          </Text>
        </View>
      </View>
      {pinned ? <Pin size={12} color={colors.textMuted} /> : null}
    </Pressable>
  )
}

export const SessionDropdownRow = memo(SessionDropdownRowComponent)

export function SessionDropdownDivider() {
  return <View style={styles.divider} />
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    // Reserves the current-session accent so current and other rows align.
    borderLeftWidth: 2,
    borderLeftColor: 'transparent'
  },
  rowCurrent: {
    backgroundColor: colors.bgRaised,
    borderLeftColor: colors.textSecondary
  },
  rowPressed: {
    backgroundColor: colors.bgRaised
  },
  indicator: {
    width: 20,
    alignItems: 'center'
  },
  main: {
    flex: 1,
    minWidth: 0
  },
  name: {
    fontSize: typography.bodySize,
    fontWeight: '600',
    color: colors.textPrimary
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2
  },
  branch: {
    flexShrink: 1,
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.monoFamily
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginVertical: spacing.xs
  }
})
