'use client'

import { useEffect } from 'react'

import { type AnalyticsItem, trackViewItem, trackViewItemList } from '@/lib/analytics'

/** Fires `view_item_list` once per list (stage 6 hook, no-op today). */
export function ViewItemListEvent({
  listId,
  listName,
  items,
}: {
  listId: string
  listName: string
  items: AnalyticsItem[]
}) {
  const key = `${listId}:${items.map((item) => item.item_id).join(',')}`
  useEffect(() => {
    trackViewItemList(listId, listName, items)
    // Fire again only when the list itself changes (filters, page).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return null
}

/** Fires `view_item` on a product detail (stage 6 hook, no-op today). */
export function ViewItemEvent({ item }: { item: AnalyticsItem }) {
  useEffect(() => {
    trackViewItem(item)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.item_id])
  return null
}
