import { Folder, FolderOpen, FolderX, X } from 'lucide-react'
import { clsx } from 'clsx'
import { cannotBeFound } from './MissingRepository'

import styles from './TabItem.module.css'

interface TabItemProps {
  label: string
  isFocused: boolean
  isMissing: boolean
  onClose: () => void
  onClick: () => void
}

export function TabItem({ label, isFocused, isMissing, onClose, onClick }: TabItemProps) {
  return (
    <li
      className={clsx(styles.tab, { [styles.isActive]: isFocused })}
      data-focused={isFocused ? 'true' : undefined}
    >
      <button
        className={clsx(styles.buttonReset, styles.tabButton, {
          [styles.isActive]: isFocused,
          [styles.isMissing]: isMissing
        })}
        aria-current={isFocused ? 'true' : undefined}
        // The icon is decorative, so the flag has to reach assistive tech as text.
        aria-description={isMissing ? `${cannotBeFound(label)}.` : undefined}
        onClick={onClick}
      >
        {isMissing ? (
          <FolderX size={16} className={styles.folder} />
        ) : isFocused ? (
          <FolderOpen size={16} className={styles.folder} />
        ) : (
          <Folder size={16} className={styles.folder} />
        )}
        <span className={styles.labelText}>{label}</span>
      </button>
      <span className={styles.closeButtonWrapper}>
        <button
          className={clsx(styles.buttonReset, styles.closeButton)}
          aria-label={`Close ${label}`}
          onClick={onClose}
        >
          <X size={12} />
        </button>
      </span>
    </li>
  )
}
