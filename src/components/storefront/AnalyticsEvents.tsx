'use client'

import { useEffect } from 'react'

import { trackSelectItem, trackViewItem, trackViewItemList } from '@/lib/analytics'
import { ITEM_ATTRIBUTE, LIST_ATTRIBUTE } from '@/lib/measurement/dom'
import type { Ga4Item } from '@/lib/measurement/items'

/**
 * Fires `view_item_list` once per list content (filters, page) and `select_item` when a link
 * inside a product card of THIS list is clicked (one delegated listener, the cards stay server
 * components).
 */
export function ViewItemListEvent({
  listId,
  listName,
  items,
}: {
  listId: string
  listName: string
  items: Ga4Item[]
}) {
  const key = `${listId}:${items.map((item) => item.item_id).join(',')}`
  useEffect(() => {
    trackViewItemList(listId, listName, items)
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null
      const link = target?.closest?.('a')
      if (!link) return
      const card = link.closest(`[${ITEM_ATTRIBUTE}]`)
      const list = link.closest(`[${LIST_ATTRIBUTE}]`)
      if (!card || list?.getAttribute(LIST_ATTRIBUTE) !== listId) return
      const item = items.find((i) => i.item_id === card.getAttribute(ITEM_ATTRIBUTE))
      if (item) trackSelectItem(listId, listName, item)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
    // Fire again only when the list itself changes (filters, page).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return null
}

/** Fires `view_item` on a product detail (the default variant – same id as in the feeds). */
export function ViewItemEvent({ item }: { item: Ga4Item }) {
  useEffect(() => {
    trackViewItem(item)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.item_id])
  return null
}
