import { useRef, useState } from 'react'
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions
} from 'react-native'
import { ChevronDown } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, radii, spacing } from '../theme/mobile-theme'
import type { Worktree } from '../worktree/workspace-list-sections'
import { SessionDropdownDivider, SessionDropdownRow } from './SessionDropdownRow'
import { resolveDropdownSelection, sessionDropdownEntries } from './session-title-dropdown'
import { styles } from './mobile-session-styles'
import { useSessionTitleDropdown } from './use-session-title-dropdown'
import type { MobileSessionController } from './use-mobile-session-controller'

const FALLBACK_ANCHOR_TOP = 96

/** The session title as a button that drops the host's session list down over the screen. */
export function MobileSessionTitleDropdown({
  controller
}: {
  controller: MobileSessionController
}) {
  const { hostId, worktreeId, client, connState, worktreeName, requestSwitchSession } = controller
  const dropdown = useSessionTitleDropdown({ hostId, client, connState })
  const titleRef = useRef<View>(null)
  const [anchorTop, setAnchorTop] = useState(FALLBACK_ANCHOR_TOP)
  const { height } = useWindowDimensions()
  const insets = useSafeAreaInsets()

  const title = (
    <Text style={styles.sessionTitle} numberOfLines={1}>
      {worktreeName || 'Terminal'}
    </Text>
  )
  if (!hostId) {
    return title
  }

  const entries = sessionDropdownEntries(dropdown.worktrees, worktreeId, dropdown.localPins)
  const select = (item: Worktree) => {
    const selection = resolveDropdownSelection({ currentWorktreeId: worktreeId, item })
    dropdown.hide()
    if (selection.kind === 'switch') {
      requestSwitchSession(selection.target)
    }
  }

  return (
    <>
      <Pressable
        ref={titleRef}
        style={[dropdownStyles.titleButton, dropdown.open && dropdownStyles.titleButtonOpen]}
        onPress={() => {
          titleRef.current?.measureInWindow((_x, y, _w, h) => {
            // The header's native safe-area padding is not in the measured y.
            setAnchorTop(insets.top + y + h)
            dropdown.show()
          })
        }}
        accessibilityRole="button"
        accessibilityLabel="Switch session"
        accessibilityState={{ expanded: dropdown.open }}
      >
        <View style={dropdownStyles.titleText}>{title}</View>
        <ChevronDown
          size={14}
          color={dropdown.open ? colors.textPrimary : colors.textSecondary}
          strokeWidth={2.2}
          style={dropdown.open ? dropdownStyles.chevronOpen : undefined}
        />
      </Pressable>
      <Modal
        visible={dropdown.open}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={dropdown.hide}
      >
        {/* The scrim starts below the title, so the title stays lit and tapping it closes the list. */}
        <Pressable
          style={[dropdownStyles.headerHit, { height: anchorTop }]}
          onPress={dropdown.hide}
          accessibilityLabel="Close session list"
        />
        <Pressable
          style={[dropdownStyles.backdrop, { top: anchorTop }]}
          onPress={dropdown.hide}
          accessibilityLabel="Close session list"
        />
        <View style={[dropdownStyles.panel, { top: anchorTop, maxHeight: height * 0.6 }]}>
          <FlatList
            data={entries}
            keyExtractor={(entry) => (entry.kind === 'divider' ? 'divider' : entry.item.worktreeId)}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: entry }) =>
              entry.kind === 'divider' ? (
                <SessionDropdownDivider />
              ) : (
                <SessionDropdownRow
                  item={entry.item}
                  pinned={entry.pinned}
                  current={entry.current}
                  onPress={select}
                />
              )
            }
          />
        </View>
      </Modal>
    </>
  )
}

const dropdownStyles = StyleSheet.create({
  titleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.button,
    paddingHorizontal: spacing.xs
  },
  titleButtonOpen: {
    backgroundColor: colors.bgRaised
  },
  chevronOpen: {
    transform: [{ rotate: '180deg' }]
  },
  titleText: {
    flexShrink: 1
  },
  headerHit: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)'
  },
  panel: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    backgroundColor: colors.bgPanel,
    borderBottomLeftRadius: radii.card,
    borderBottomRightRadius: radii.card,
    overflow: 'hidden',
    shadowColor: colors.bgBase,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8
  }
})
