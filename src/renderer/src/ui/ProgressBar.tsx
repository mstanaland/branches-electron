import { Progress } from '@base-ui/react/progress'
import styles from './ProgressBar.module.css'

export interface ProgressBarProps {
  /** The accessible name. The bar has no visible label. */
  'aria-label': string
  className?: string
}

/**
 * A thin, indeterminate progress bar: something is happening, with no measure of how much is
 * left. A track the width of its container with a segment sliding across it.
 */
export function ProgressBar({ className, ...props }: ProgressBarProps): React.JSX.Element {
  return (
    <Progress.Root
      value={null}
      className={className ? `${styles.root} ${className}` : styles.root}
      {...props}
    >
      <Progress.Track className={styles.track}>
        <Progress.Indicator className={styles.indicator} />
      </Progress.Track>
    </Progress.Root>
  )
}
