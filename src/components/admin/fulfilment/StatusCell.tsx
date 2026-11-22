'use client'

import type { DefaultCellComponentProps } from 'payload'
import React from 'react'

import { StatusPill } from './StatusPill'

/** List column "Stav" of orders as a coloured badge. */
export function StatusCell({ cellData }: DefaultCellComponentProps) {
  return <StatusPill status={typeof cellData === 'string' ? cellData : null} />
}
