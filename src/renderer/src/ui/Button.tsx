import { Button as BaseButton } from '@base-ui/react/button'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'link'

export interface ButtonProps extends Omit<BaseButton.Props, 'className'> {
  /**
   * `quiet` is the borderless one for headers and toolbars. `danger` is for the button that
   * destroys something, like Delete Branch — never the default button.
   */
  variant?: ButtonVariant
  className?: string
}

export function Button({
  variant = 'secondary',
  className,
  type = 'button',
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <BaseButton
      type={type}
      data-variant={variant}
      className={className ? `${styles.button} ${className}` : styles.button}
      {...props}
    />
  )
}
