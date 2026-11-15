import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox'
import { Check, Minus } from 'lucide-react'
import styles from './Checkbox.module.css'

export interface CheckboxProps extends Omit<BaseCheckbox.Root.Props, 'className' | 'children'> {
  /** Shown as a dash instead of a tick, e.g. for a partially staged change. */
  indeterminate?: boolean
  className?: string
}

/** A checkbox with a tick, or a dash when `indeterminate`. Give it an `aria-label`. */
export function Checkbox({ className, indeterminate, ...props }: CheckboxProps): React.JSX.Element {
  return (
    <BaseCheckbox.Root
      indeterminate={indeterminate}
      className={className ? `${styles.checkbox} ${className}` : styles.checkbox}
      {...props}
    >
      <BaseCheckbox.Indicator className={styles.indicator} keepMounted={false}>
        {indeterminate ? <Minus strokeWidth={3} /> : <Check strokeWidth={3} />}
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  )
}
