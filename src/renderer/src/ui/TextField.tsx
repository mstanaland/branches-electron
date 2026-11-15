import { Field } from '@base-ui/react/field'
import { Input } from '@base-ui/react/input'
import styles from './TextField.module.css'

export interface TextFieldProps extends Omit<
  Input.Props,
  'className' | 'render' | 'children' | 'ref'
> {
  /** The control's accessible name. Visually hidden unless `showLabel`. */
  label: string
  /**
   * The control itself, for callers that move focus. Typed as the element both variants
   * share, since this is an `<input>` or a `<textarea>` depending on `multiline`.
   */
  ref?: React.Ref<HTMLElement>
  /** Shows the label above the control. Off by default: a placeholder is not a name. */
  showLabel?: boolean
  /** Renders a `<textarea>` instead of a single-line `<input>`. */
  multiline?: boolean
  /** Visible rows, for a multiline field. */
  rows?: number
  className?: string
}

/**
 * A labelled text input, or a textarea when `multiline`. Built on Base UI's Field, so the
 * label is always wired to the control — give every field a `label`, even a hidden one,
 * because a placeholder is not an accessible name.
 */
export function TextField({
  label,
  showLabel = false,
  multiline = false,
  rows,
  className,
  ref,
  ...props
}: TextFieldProps): React.JSX.Element {
  return (
    <Field.Root className={className ? `${styles.field} ${className}` : styles.field}>
      <Field.Label className={showLabel ? styles.label : styles.visuallyHidden}>
        {label}
      </Field.Label>
      {multiline ? (
        <Field.Control
          ref={ref}
          className={styles.control}
          render={<textarea rows={rows} />}
          {...props}
        />
      ) : (
        <Input ref={ref} className={styles.control} {...props} />
      )}
    </Field.Root>
  )
}
