import { describe, expect, it } from 'vitest'
import { enqueueWrite } from './queue'

const tick = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe('enqueueWrite', () => {
  it('runs writes for one repository one at a time, in order', async () => {
    const log: string[] = []
    const write = (name: string, ms: number) =>
      enqueueWrite('/repo', async () => {
        log.push(`start ${name}`)
        await tick(ms)
        log.push(`end ${name}`)
      })

    await Promise.all([write('a', 20), write('b', 1)])

    expect(log).toEqual(['start a', 'end a', 'start b', 'end b'])
  })

  it('runs writes for different repositories in parallel', async () => {
    const log: string[] = []
    const write = (root: string) =>
      enqueueWrite(root, async () => {
        log.push(`start ${root}`)
        await tick(10)
        log.push(`end ${root}`)
      })

    await Promise.all([write('/one'), write('/two')])

    expect(log.slice(0, 2)).toEqual(['start /one', 'start /two'])
  })

  it('returns what the write returns', async () => {
    await expect(enqueueWrite('/repo', async () => 42)).resolves.toBe(42)
  })

  it('keeps going after a write fails, and still reports the failure', async () => {
    const failing = enqueueWrite('/repo', async () => {
      throw new Error('nope')
    })
    const after = enqueueWrite('/repo', async () => 'ran')

    await expect(failing).rejects.toThrow('nope')
    await expect(after).resolves.toBe('ran')
  })
})
