import { Select as BaseSelect } from '@base-ui/react/select'
import { Check, ChevronsUpDown } from 'lucide-react'
import styles from './Select.module.css'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps {
  /**
   * The control's accessible name. Always visually hidden, as in `TextField`: the screen
   * that uses it shows its own label beside it.
   */
  label: string
  value: string
  onValueChange: (value: string) => void
  options: readonly SelectOption[]
  disabled?: boolean
}

/** Picks one of a few options from a popup list, like a Mac pop-up button. */
export function Select({
  label,
  value,
  onValueChange,
  options,
  disabled = false
}: SelectProps): React.JSX.Element {
  return (
    <BaseSelect.Root
      items={options}
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next)
      }}
    >
      <BaseSelect.Label className={styles.visuallyHidden}>{label}</BaseSelect.Label>
      <BaseSelect.Trigger className={styles.trigger}>
        <BaseSelect.Value className={styles.value} />
        <BaseSelect.Icon className={styles.icon}>
          <ChevronsUpDown />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner className={styles.positioner} sideOffset={4}>
          <BaseSelect.Popup className={styles.popup}>
            <BaseSelect.List>
              {options.map((option) => (
                <BaseSelect.Item key={option.value} value={option.value} className={styles.item}>
                  <BaseSelect.ItemIndicator className={styles.indicator}>
                    <Check />
                  </BaseSelect.ItemIndicator>
                  <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  )
}
