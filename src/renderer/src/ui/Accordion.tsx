import { Accordion as BaseAccordion } from '@base-ui/react/accordion'
import { ChevronRight } from 'lucide-react'
import styles from './Accordion.module.css'

export interface AccordionProps {
  children: React.ReactNode
  className?: string
}

/**
 * A list of items that each open onto their content. Every item starts collapsed, and any
 * number can be open at once. Uncontrolled: remount it (a `key`) to collapse everything.
 */
export function Accordion({ children, className }: AccordionProps): React.JSX.Element {
  return (
    <BaseAccordion.Root
      multiple
      className={className ? `${styles.accordion} ${className}` : styles.accordion}
    >
      {children}
    </BaseAccordion.Root>
  )
}

export interface AccordionItemProps {
  /** What the item's row shows beside its chevron. It names the button that opens it. */
  title: React.ReactNode
  /** Rendered only while the item is open, so anything it loads waits until then. */
  children: React.ReactNode
}

/** One row of an `Accordion`: a chevron and a title, opening onto `children`. */
export function AccordionItem({ title, children }: AccordionItemProps): React.JSX.Element {
  return (
    <BaseAccordion.Item className={styles.item}>
      <BaseAccordion.Header className={styles.header}>
        <BaseAccordion.Trigger className={styles.trigger}>
          <ChevronRight aria-hidden="true" className={styles.chevron} />
          {title}
        </BaseAccordion.Trigger>
      </BaseAccordion.Header>
      <BaseAccordion.Panel className={styles.panel}>{children}</BaseAccordion.Panel>
    </BaseAccordion.Item>
  )
}
