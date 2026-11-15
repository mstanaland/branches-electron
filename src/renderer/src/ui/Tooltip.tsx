import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'
import styles from './Tooltip.module.css'

/** Mount once at the root; it shares the hover delay between tooltips. */
export function TooltipProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <BaseTooltip.Provider delay={300}>{children}</BaseTooltip.Provider>
}

export interface TooltipProps {
  /** What the tooltip says. With null or an empty string the child renders as it is. */
  content: React.ReactNode
  /** The element to attach to. It must accept a ref and DOM event props. */
  children: React.ReactElement<Record<string, unknown>>
}

/** Opens on hover (after a short delay) and on keyboard focus. */
export function Tooltip({ content, children }: TooltipProps): React.JSX.Element {
  if (content === null || content === undefined || content === '') return children

  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner sideOffset={6}>
          <BaseTooltip.Popup className={styles.popup}>{content}</BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  )
}
