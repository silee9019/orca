import { useEffect, useState } from 'react'
import type {
  BrowserPageAnnotation,
  BrowserAnnotationIntent
} from '../../../../../shared/browser-grab-types'
export function useBrowserAnnotationRowEditor(
  browserAnnotations: BrowserPageAnnotation[],
  handleUpdateBrowserAnnotation: (
    id: string,
    comment: string,
    intent: BrowserAnnotationIntent
  ) => void
) {
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null)
  const [editComment, setEditComment] = useState('')
  const [editIntent, setEditIntent] = useState<BrowserAnnotationIntent>('change')

  // Why: a delete or clear while a row is mid-edit must not leave edit state pointing at nothing.
  useEffect(() => {
    if (
      editingAnnotationId &&
      !browserAnnotations.some((annotation) => annotation.id === editingAnnotationId)
    ) {
      setEditingAnnotationId(null)
    }
  }, [browserAnnotations, editingAnnotationId])

  const handleStartEdit = (annotation: BrowserPageAnnotation): void => {
    setEditingAnnotationId(annotation.id)
    setEditComment(annotation.comment)
    setEditIntent(annotation.intent)
  }

  const handleCancelEdit = (): void => {
    setEditingAnnotationId(null)
  }

  const handleSaveEdit = (): void => {
    const trimmed = editComment.trim()
    if (!trimmed || !editingAnnotationId) {
      return
    }
    handleUpdateBrowserAnnotation(editingAnnotationId, trimmed, editIntent)
    setEditingAnnotationId(null)
  }

  return {
    browserAnnotations,
    editingAnnotationId,
    editComment,
    editIntent,
    setEditComment,
    setEditIntent,
    handleStartEdit,
    handleCancelEdit,
    handleSaveEdit
  }
}
