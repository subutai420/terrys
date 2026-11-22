'use client'

import { toast } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React, { useEffect, useMemo, useRef, useState } from 'react'

import type { PriceUnit } from '@/lib/catalog'
import { formatCzk, formatUnitPrice } from '@/lib/format'
import type { LineResolution } from '@/lib/orders/constants'
import {
  estimatedLineGrams,
  formatDeviation,
  isWeighingComplete,
  lineOverTolerance,
  lineProblem,
  linePreviewPrice,
  needsWeighing,
  parseGrams,
  type WeighLine,
  weightDeviation,
} from '@/lib/orders/fulfilment'
import { formatWeight } from '@/lib/productView'

import { postJson, responseText } from './api'

export type WeighClientLine = WeighLine & {
  id: string
  pieceWeights: string | null
}

type LineState = {
  text: string
  perPiece: boolean
  pieces: string[]
  mode: 'normal' | 'substituted' | 'unavailable'
  weighNote: string
  toleranceNote: string
}

const QUICK_REASONS = [
  'Celý kus nejde rozdělit',
  'Zákazník souhlasil po telefonu',
  'Jiná velikost kusu není',
  'Poznámka zákazníka',
]

const UNIT: Record<PriceUnit, string> = { kg: 'kg', '100g': '100 g', piece: 'ks' }

function initialState(line: WeighClientLine): LineState {
  const pieces = (line.pieceWeights ?? '').split(/[,;\s]+/).filter(Boolean)
  return {
    text: line.actualWeightGrams ? String(line.actualWeightGrams) : '',
    perPiece: pieces.length > 1,
    pieces: pieces.length > 1 ? pieces : Array.from({ length: line.quantity }, () => ''),
    mode:
      line.resolution === 'unavailable'
        ? 'unavailable'
        : line.resolution === 'substituted'
          ? 'substituted'
          : 'normal',
    weighNote: line.weighNote ?? '',
    toleranceNote: line.toleranceNote ?? '',
  }
}

function gramsOf(state: LineState): number | null {
  if (state.perPiece) {
    const values = state.pieces.map(parseGrams)
    if (values.some((v) => v === null)) return null
    return values.reduce<number>((sum, v) => sum + (v ?? 0), 0) || null
  }
  return parseGrams(state.text)
}

function effective(line: WeighClientLine, state: LineState): WeighLine {
  const grams = gramsOf(state)
  let resolution: LineResolution | null
  if (state.mode === 'unavailable') resolution = 'unavailable'
  else if (!needsWeighing(line)) resolution = 'piece'
  else if (grams) resolution = state.mode === 'substituted' ? 'substituted' : 'weighed'
  else resolution = null
  return {
    ...line,
    actualWeightGrams: resolution === 'weighed' || resolution === 'substituted' ? grams : null,
    resolution,
    weighNote: state.weighNote,
    toleranceNote: state.toleranceNote,
  }
}

/** The interactive part of the weighing screen (live prices with the shared money module). */
export function WeighingClient({
  orderId,
  lines,
  tolerancePercent,
  deliveryPrice,
  estimateTotal,
  editable,
  status,
  backHref,
}: {
  orderId: number
  lines: WeighClientLine[]
  tolerancePercent: number
  deliveryPrice: number
  estimateTotal: number
  editable: boolean
  status: string
  backHref: string
}) {
  const router = useRouter()
  const [states, setStates] = useState<LineState[]>(() => lines.map(initialState))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState<null | 'save' | 'done'>(null)
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const current = useMemo(() => lines.map((line, i) => effective(line, states[i])), [lines, states])
  const complete = isWeighingComplete(current, tolerancePercent)
  const goods = current.reduce((sum, line) => sum + (linePreviewPrice(line) ?? 0), 0)
  const resolvedCount = current.filter(
    (line) => lineProblem(line, tolerancePercent) === null,
  ).length

  const update = (index: number, patch: Partial<LineState>) => {
    setDirty(true)
    setStates((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  const focusNext = (index: number) => {
    const next = inputs.current.slice(index + 1).find(Boolean)
    if (next) next.focus()
    else (document.activeElement as HTMLElement | null)?.blur()
  }

  const save = async (markWeighed: boolean) => {
    setSaving(markWeighed ? 'done' : 'save')
    const result = await postJson(`orders/${orderId}/weigh`, {
      markWeighed,
      lines: lines.map((line, i) => {
        const eff = current[i]
        const s = states[i]
        return {
          id: line.id,
          actualWeightGrams: eff.actualWeightGrams ?? null,
          resolution: eff.resolution === 'piece' ? null : eff.resolution,
          pieceWeights: s.perPiece ? s.pieces.map((p) => parseGrams(p) ?? '').join(', ') : null,
          weighNote: s.weighNote || null,
          toleranceNote: s.toleranceNote || null,
        }
      }),
    })
    setSaving(null)
    if (!result.ok) {
      toast.error(responseText(result) || 'Uložení se nepovedlo.')
      return
    }
    setDirty(false)
    if (markWeighed) {
      toast.success('Hotovo – objednávka je zvážená.')
      router.push(backHref)
    } else {
      toast.success(['Uloženo.', ...(result.messages ?? [])].join(' '))
      router.refresh()
    }
  }

  return (
    <>
      {lines.map((line, i) => {
        const s = states[i]
        const eff = current[i]
        const weighable = needsWeighing(line)
        const target = estimatedLineGrams(line)
        const grams = eff.actualWeightGrams ?? null
        const deviation = weightDeviation(target, grams)
        const over = lineOverTolerance(eff, tolerancePercent)
        const problem = lineProblem(eff, tolerancePercent)
        const price = linePreviewPrice(eff)
        const cls =
          s.mode === 'unavailable'
            ? 'tf-line--off'
            : over
              ? 'tf-line--warn'
              : problem === null
                ? 'tf-line--done'
                : ''
        return (
          <div className={`tf-line ${cls}`} data-testid="weigh-line" key={line.id}>
            <div className="tf-row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <p className="tf-line-title">
                  {line.quantity > 1 ? `${line.quantity}× ` : ''}
                  {line.productTitle}
                </p>
                <p className="tf-line-target">
                  {weighable ? (
                    <>
                      {line.variantLabel ? `${line.variantLabel} · ` : ''}cíl{' '}
                      <strong>{target ? formatWeight(target) : '–'}</strong>
                      {line.quantity > 1 && line.estimatedWeightGrams
                        ? ` (${line.quantity} × ${formatWeight(line.estimatedWeightGrams)})`
                        : ''}
                    </>
                  ) : (
                    <>
                      {line.variantLabel ? `${line.variantLabel} · ` : ''}kusové zboží – neváží se
                    </>
                  )}
                  <span className="tf-muted">
                    {' '}
                    · {formatUnitPrice(line.unitPrice)} / {UNIT[line.priceUnit]}
                  </span>
                </p>
              </div>
              <div className="tf-line-result" style={{ textAlign: 'right' }}>
                {s.mode === 'unavailable' ? (
                  <strong>0 Kč</strong>
                ) : price !== null ? (
                  <strong data-testid="weigh-line-price">{formatCzk(price)}</strong>
                ) : (
                  <span className="tf-muted">odhad {formatCzk(line.estimatedPrice)}</span>
                )}
                {deviation !== null && s.mode !== 'unavailable' && (
                  <div
                    className={`tf-dev ${over ? 'tf-dev--warn' : 'tf-dev--ok'}`}
                    data-testid="weigh-line-deviation"
                  >
                    {formatDeviation(deviation)} proti odhadu
                  </div>
                )}
              </div>
            </div>

            {weighable && s.mode !== 'unavailable' && (
              <div className="tf-weight-row">
                {!s.perPiece ? (
                  <label className="tf-weight-input">
                    <input
                      aria-label={`Hmotnost ${line.productTitle} v gramech`}
                      autoComplete="off"
                      data-testid="weigh-input"
                      disabled={!editable}
                      enterKeyHint="next"
                      inputMode="numeric"
                      onChange={(e) =>
                        update(i, { text: e.target.value.replace(/[^\d\s.,kg]/gi, '') })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          focusNext(i)
                        }
                      }}
                      pattern="[0-9]*"
                      placeholder=""
                      ref={(el) => {
                        inputs.current[i] = el
                      }}
                      type="text"
                      value={s.text}
                    />
                    <span>g</span>
                  </label>
                ) : (
                  s.pieces.map((piece, p) => (
                    <label className="tf-weight-input tf-weight-input--small" key={p}>
                      <input
                        aria-label={`Kus ${p + 1} v gramech`}
                        disabled={!editable}
                        inputMode="numeric"
                        onChange={(e) =>
                          update(i, {
                            pieces: s.pieces.map((v, k) =>
                              k === p ? e.target.value.replace(/[^\d]/g, '') : v,
                            ),
                          })
                        }
                        pattern="[0-9]*"
                        placeholder={`${p + 1}. kus`}
                        type="text"
                        value={piece}
                      />
                      <span>g</span>
                    </label>
                  ))
                )}
                {line.quantity > 1 && editable && (
                  <button
                    className="tf-toggle"
                    onClick={() => update(i, { perPiece: !s.perPiece })}
                    type="button"
                    aria-pressed={s.perPiece}
                  >
                    {s.perPiece
                      ? `Celkem ${grams ? formatWeight(grams) : '–'} · vážit najednou`
                      : 'Vážit po kusech'}
                  </button>
                )}
              </div>
            )}

            {over && s.mode !== 'unavailable' && (
              <div className="tf-tolerance" data-testid="weigh-tolerance">
                <p>
                  <strong>
                    Odchylka {formatDeviation(deviation)} je víc než povolených ±{tolerancePercent}{' '}
                    %.
                  </strong>{' '}
                  Vážení to nezablokuje, ale napište krátký důvod – objednávku zkontroluje obsluha.
                </p>
                <div className="tf-chips" style={{ marginBottom: 8 }}>
                  {QUICK_REASONS.map((reason) => (
                    <button
                      className={`tf-chip${s.toleranceNote === reason ? ' tf-chip--active' : ''}`}
                      disabled={!editable}
                      key={reason}
                      onClick={() => update(i, { toleranceNote: reason })}
                      type="button"
                    >
                      {reason}
                    </button>
                  ))}
                </div>
                <input
                  aria-label="Důvod odchylky"
                  className="tf-text-input"
                  data-testid="weigh-tolerance-note"
                  disabled={!editable}
                  maxLength={500}
                  onChange={(e) => update(i, { toleranceNote: e.target.value })}
                  placeholder="Důvod odchylky"
                  value={s.toleranceNote}
                />
              </div>
            )}

            {editable && (
              <div className="tf-toggle-row">
                {weighable && (
                  <button
                    aria-pressed={s.mode === 'substituted'}
                    className="tf-toggle"
                    onClick={() =>
                      update(i, { mode: s.mode === 'substituted' ? 'normal' : 'substituted' })
                    }
                    type="button"
                  >
                    Náhrada
                  </button>
                )}
                <button
                  aria-pressed={s.mode === 'unavailable'}
                  className="tf-toggle"
                  data-testid="weigh-unavailable"
                  onClick={() =>
                    update(i, { mode: s.mode === 'unavailable' ? 'normal' : 'unavailable' })
                  }
                  type="button"
                >
                  Není k dispozici
                </button>
              </div>
            )}
            {(s.mode !== 'normal' || s.weighNote) && (
              <div style={{ marginTop: 10 }}>
                <input
                  aria-label="Poznámka k položce"
                  className="tf-text-input"
                  disabled={!editable}
                  maxLength={500}
                  onChange={(e) => update(i, { weighNote: e.target.value })}
                  placeholder={
                    s.mode === 'substituted' ? 'Čím je nahrazeno (povinné)' : 'Poznámka (nepovinné)'
                  }
                  value={s.weighNote}
                />
              </div>
            )}
            {problem &&
            editable &&
            s.mode !== 'unavailable' &&
            (eff.actualWeightGrams || s.mode === 'substituted') ? (
              <p className="tf-muted" style={{ margin: '8px 0 0', color: 'var(--tf-warn)' }}>
                Chybí: {problem}
              </p>
            ) : null}
          </div>
        )
      })}

      {editable && (
        <div className="tf-sticky">
          <div className="tf-sticky-inner">
            <div className="tf-sticky-total" data-testid="weigh-total">
              Zboží: <strong>{formatCzk(goods)}</strong>
              <span className="tf-muted">
                {' '}
                (odhad {formatCzk(estimateTotal)}
                {deliveryPrice ? ` + doprava ${formatCzk(deliveryPrice)}` : ''}) · hotovo{' '}
                {resolvedCount}/{lines.length}
              </span>
            </div>
            <span className="tf-spacer" />
            <button
              className="tf-btn tf-btn--big"
              data-testid="weigh-save"
              disabled={saving !== null}
              onClick={() => save(false)}
              type="button"
            >
              {saving === 'save' ? 'Ukládám…' : 'Uložit rozpracované'}
            </button>
            <button
              className="tf-btn tf-btn--big tf-btn--primary"
              data-testid="weigh-done"
              disabled={!complete || saving !== null}
              onClick={() => save(status === 'received')}
              title={complete ? '' : 'Nejdřív zvažte všechny položky'}
              type="button"
            >
              {saving === 'done'
                ? 'Ukládám…'
                : status === 'received'
                  ? 'Hotovo – zváženo'
                  : 'Uložit změny'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
