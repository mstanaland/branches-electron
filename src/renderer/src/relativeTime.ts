/** Largest unit first, each with its length in seconds. Months and years are approximate. */
const UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['week', 7 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60]
]

/** Built once: a formatter per call would be wasted work. */
const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

/**
 * How long ago `iso` was, in the locale's words: "3 days ago", "yesterday", "now". The empty
 * string for a timestamp no `Date` can parse.
 */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return ''
  const seconds = Math.round((time - now.getTime()) / 1000)
  for (const [unit, length] of UNITS) {
    if (Math.abs(seconds) >= length)
      return relativeFormat.format(Math.round(seconds / length), unit)
  }
  return relativeFormat.format(0, 'second')
}
