import type { InputHTMLAttributes, ReactNode } from 'react'

type Props = {
  id: string
  label: string
  error?: string
  help?: ReactNode
  optional?: boolean
  className?: string
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>

/**
 * Labelled text input with an inline error (aria-invalid + aria-describedby, announced to
 * screen readers) – the building block of the checkout and withdrawal forms.
 */
export function Field({ id, label, error, help, optional, className = '', ...input }: Props) {
  const describedBy = [error ? `${id}-error` : null, help ? `${id}-help` : null]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block font-semibold">
        {label}
        {optional ? <span className="font-normal text-muted"> (nepovinné)</span> : null}
      </label>
      <input
        id={id}
        className="input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...input}
      />
      {error ? (
        <p
          id={`${id}-error`}
          className="mt-1 text-sm font-semibold text-brand-red"
          data-testid={`error-${id}`}
        >
          {error}
        </p>
      ) : null}
      {help ? (
        <p id={`${id}-help`} className="mt-1 text-sm text-muted">
          {help}
        </p>
      ) : null}
    </div>
  )
}
