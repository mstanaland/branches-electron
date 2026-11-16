/** The length every oid is shortened to on screen. See GLOSSARY.md, "Short oid". */
export const SHORT_OID_LENGTH = 8

/**
 * The first eight characters of an object id.
 *
 * Git's own `--abbrev` picks a length from how big the repository is, so the same commit can
 * read as seven characters in one place and nine in another. We always take eight ourselves,
 * from the full oid, so every oid on screen is the same width and two views can't disagree
 * about the same commit. An oid shorter than eight characters is returned as it is.
 */
export function shortOid(oid: string): string {
  return oid.slice(0, SHORT_OID_LENGTH)
}
