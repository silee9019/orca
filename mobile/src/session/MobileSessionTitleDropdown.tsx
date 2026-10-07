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
import { WorktreeListRow } from '../components/WorktreeListRow'
import { colors } from '../theme/mobile-theme'
import { repoColor } from '../worktree/repo-color'
import { getWorktreeStatus } from '../worktree/workspace-list-ordering'
import type { Worktree } from '../worktree/workspace-list-sections'
import { resolveDropdownSelection, sessionDropdownRows } from './session-title-dropdown'
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
  const [now, setNow] = useState(0)
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

  const rows = sessionDropdownRows(dropdown.worktrees, worktreeId)
  const select = (item: Worktree) => {
    const selection = resolveDropdownSelection({ hostId, currentWorktreeId: worktreeId, item })
    dropdown.hide()
    if (selection.kind === 'switch') {
      requestSwitchSession(selection.href)
    }
  }

  return (
    <>
      <Pressable
        ref={titleRef}
        style={dropdownStyles.titleButton}
        onPress={() => {
          titleRef.current?.measureInWindow((_x, y, _w, h) => {
            // The header's native safe-area padding is not in the measured y.
            setAnchorTop(insets.top + y + h)
            setNow(Date.now())
            dropdown.show()
          })
        }}
        accessibilityRole="button"
        accessibilityLabel="Switch session"
        accessibilityState={{ expanded: dropdown.open }}
      >
        <View style={dropdownStyles.titleText}>{title}</View>
        <ChevronDown size={14} color={colors.textSecondary} strokeWidth={2.2} />
      </Pressable>
      <Modal
        visible={dropdown.open}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={dropdown.hide}
      >
        <Pressable
          style={dropdownStyles.backdrop}
          onPress={dropdown.hide}
          accessibilityLabel="Close session list"
        />
        <View style={[dropdownStyles.panel, { top: anchorTop, maxHeight: height * 0.6 }]}>
          <FlatList
            data={rows}
            keyExtractor={(item) => item.worktreeId}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <WorktreeListRow
                item={item}
                isReadOnly={false}
                now={now}
                status={getWorktreeStatus(item)}
                repoColor={repoColor(item.repo)}
                onPress={select}
              />
            )}
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
    gap: 4
  },
  titleText: {
    flexShrink: 1
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)'
  },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.bgPanel,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle
  }
})
