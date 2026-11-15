import { useRender } from '@base-ui/react/use-render'
import styles from './Badge.module.css'

export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'outline'
  | 'destructive'
  | 'success'
  | 'warning'
  | 'info'

export interface BadgeProps extends useRender.ComponentProps<'span'> {
  variant?: BadgeVariant
}

/**
 * A small status label. An icon child takes `data-icon="inline-start"` or `"inline-end"` so the
 * badge can pad that side tighter.
 */
export function Badge({
  variant = 'default',
  className,
  render,
  ...props
}: BadgeProps): React.JSX.Element {
  return useRender({
    defaultTagName: 'span',
    render,
    props: {
      'data-variant': variant,
      className: className ? `${styles.badge} ${className}` : styles.badge,
      ...props
    }
  })
}
