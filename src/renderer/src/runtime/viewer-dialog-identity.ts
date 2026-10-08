export function observeViewerDialogIdentity(
  ownedDialog: () => HTMLElement | null,
  superseded: () => void,
  attributeFilter: string[]
): MutationObserver {
  const observer = new MutationObserver((records) => {
    const dialog = ownedDialog()
    if (!dialog) {
      return
    }
    for (const record of records) {
      if (
        record.type === 'childList' &&
        [...record.removedNodes].some((node) => node === dialog || node.contains(dialog))
      ) {
        superseded()
      }
      if (record.type === 'attributes' && record.target === dialog) {
        superseded()
      }
    }
  })
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter
  })
  return observer
}
