import { describe, expect, it } from 'vitest'
import { SHORT_OID_LENGTH, shortOid } from './oid'

describe('shortOid', () => {
  it('takes the first eight characters of a full oid', () => {
    expect(shortOid('62d76d8640f1b2c3d4e5f60718293a4b5c6d7e8f')).toBe('62d76d86')
  })

  it('is always the same width, whatever the oid', () => {
    const oids = ['0'.repeat(40), 'a'.repeat(40), '62d76d8640f1b2c3d4e5f60718293a4b5c6d7e8f']
    for (const oid of oids) expect(shortOid(oid)).toHaveLength(SHORT_OID_LENGTH)
  })

  it('leaves an oid shorter than eight characters alone', () => {
    expect(shortOid('abc12')).toBe('abc12')
  })

  it('returns the empty string for an empty oid', () => {
    expect(shortOid('')).toBe('')
  })
})
