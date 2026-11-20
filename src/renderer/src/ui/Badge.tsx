import { useRender } from '@base-ui/react/use-render'
import { clsx } from 'clsx'
import styles from './Badge.module.css'

export type BadgeVariant =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'destructive'
  | 'success'
  | 'warning'
  | 'info'

export interface BadgeProps extends useRender.ComponentProps<'span'> {
  variant?: BadgeVariant
  isSquare?: boolean
}

/**
 * A small status label. An icon child takes `data-icon="inline-start"` or `"inline-end"` so the
 * badge can pad that side tighter.
 */
export function Badge({
  variant = 'default',
  isSquare = false,
  className,
  render,
  ...props
}: BadgeProps): React.JSX.Element {
  return useRender({
    defaultTagName: 'span',
    render,
    props: {
      'data-variant': variant,
      className: clsx(styles.badge, isSquare && styles.square, className),
      ...props
    }
  })
}
