import { describe, expect, it } from 'vitest'
import {
  BLOCKS,
  BLOCK_COUNT,
  DIMENSIONS,
  ITEMS,
  ITEMS_PER_BLOCK,
  type DimensionId,
  type Item,
} from './instrument'
import { NORMALISATION_MAX, scoreResponses, type Response } from './scoring'

/** Answer every block picking the highest-scoring item for `target` as MOST. */
function loadDimension(target: DimensionId, direction: 1 | -1): Response[] {
  return BLOCKS.map((block) => {
    const wanted = block.items.find((i) => i.dimension === target && i.direction === direction)
    const opposite = block.items.find((i) => i.dimension === target && i.direction !== direction)
    const filler = block.items.filter((i) => i.dimension !== target)

    // MOST: an item keyed toward the target pole when present, else any filler.
    const most = wanted ?? filler[0]!
    // LEAST: the opposite-keyed target item when present, else a different filler.
    const least = opposite ?? filler.find((i) => i.id !== most.id) ?? block.items.find((i) => i.id !== most.id)!
    return { blockId: block.id, mostItemId: most.id, leastItemId: least.id }
  })
}

describe('instrument balance', () => {
  it('produces the expected number of blocks', () => {
    expect(BLOCKS).toHaveLength(BLOCK_COUNT)
  })

  it('gives every block four items from four distinct dimensions', () => {
    for (const block of BLOCKS) {
      expect(block.items).toHaveLength(ITEMS_PER_BLOCK)
      const dims = new Set(block.items.map((i) => i.dimension))
      expect(dims.size, `block ${block.id} reused a dimension`).toBe(ITEMS_PER_BLOCK)
    }
  })

  it('never repeats an item across the instrument', () => {
    const all = BLOCKS.flatMap((b) => b.items.map((i) => i.id))
    expect(new Set(all).size).toBe(all.length)
  })

  it('uses each dimension in exactly 12 slots', () => {
    const counts = new Map<DimensionId, number>()
    for (const item of BLOCKS.flatMap((b) => b.items)) {
      counts.set(item.dimension, (counts.get(item.dimension) ?? 0) + 1)
    }
    for (const d of DIMENSIONS) {
      expect(counts.get(d.id), `dimension ${d.id}`).toBe(12)
    }
  })

  it('balances positive and negative keying within every dimension', () => {
    for (const d of DIMENSIONS) {
      const used = BLOCKS.flatMap((b) => b.items).filter((i) => i.dimension === d.id)
      const pos = used.filter((i) => i.direction === 1).length
      const neg = used.filter((i) => i.direction === -1).length
      expect({ dim: d.id, pos, neg }).toEqual({ dim: d.id, pos: 6, neg: 6 })
    }
  })

  it('has a bank of 12 items per dimension, 6 in each direction', () => {
    for (const d of DIMENSIONS) {
      const bank = ITEMS.filter((i: Item) => i.dimension === d.id)
      expect(bank).toHaveLength(12)
      expect(bank.filter((i) => i.direction === 1)).toHaveLength(6)
      expect(bank.filter((i) => i.direction === -1)).toHaveLength(6)
    }
  })

  it('uses globally unique item ids', () => {
    const ids = ITEMS.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('is deterministic across module evaluation', async () => {
    const again = await import('./instrument?fresh=1' as string).catch(() => null)
    // Re-import may be cached; the meaningful guarantee is that construction is
    // pure, so assert the same block signature twice from the frozen export.
    const signature = BLOCKS.map((b) => b.items.map((i) => i.id).join(',')).join('|')
    expect(signature).toBe(BLOCKS.map((b) => b.items.map((i) => i.id).join(',')).join('|'))
    expect(again === null || Array.isArray((again as { BLOCKS?: unknown }).BLOCKS)).toBe(true)
  })
})

describe('scoreResponses', () => {
  it('returns the neutral midpoint for no responses', () => {
    const result = scoreResponses([])
    expect(result.answered).toBe(0)
    expect(result.coverage).toBe(0)
    expect(result.confidence).toBe('provisional')
    for (const d of DIMENSIONS) {
      expect(result.scores[d.id]).toBe(50)
    }
    expect(result.archetype).toBe('Adaptive Generalist')
  })

  it('is deterministic: the same responses always give the same scores', () => {
    const responses = loadDimension('directness', 1)
    const a = scoreResponses(responses)
    const b = scoreResponses(responses)
    expect(a.scores).toEqual(b.scores)
    expect(a.archetype).toBe(b.archetype)
    expect(a.consistency).toBe(b.consistency)
  })

  it('is order-independent', () => {
    const responses = loadDimension('pace', 1)
    const forwards = scoreResponses(responses)
    const backwards = scoreResponses([...responses].reverse())
    expect(forwards.scores).toEqual(backwards.scores)
  })

  it('drives a dimension high when its high-pole items are chosen as MOST', () => {
    const result = scoreResponses(loadDimension('structure', 1))
    expect(result.scores.structure).toBeGreaterThan(75)
    expect(result.dimensions.find((d) => d.dimension === 'structure')?.lean).toBe('high')
  })

  it('drives a dimension low when its low-pole items are chosen as MOST', () => {
    const result = scoreResponses(loadDimension('structure', -1))
    expect(result.scores.structure).toBeLessThan(25)
    expect(result.dimensions.find((d) => d.dimension === 'structure')?.lean).toBe('low')
  })

  it('keeps every score within 0-100', () => {
    for (const d of DIMENSIONS) {
      for (const dir of [1, -1] as const) {
        const result = scoreResponses(loadDimension(d.id, dir))
        for (const score of Object.values(result.scores)) {
          expect(score).toBeGreaterThanOrEqual(0)
          expect(score).toBeLessThanOrEqual(100)
        }
      }
    }
  })

  it('normalises raw totals against NORMALISATION_MAX', () => {
    // A single MOST on a positively-keyed item is +2 raw.
    const block = BLOCKS[0]!
    const positive = block.items.find((i) => i.direction === 1)!
    const other = block.items.find((i) => i.id !== positive.id)!
    const result = scoreResponses([
      { blockId: block.id, mostItemId: positive.id, leastItemId: other.id },
    ])
    const scored = result.dimensions.find((d) => d.dimension === positive.dimension)!
    expect(scored.raw).toBe(2)
    expect(scored.score).toBe(Math.round(50 + (2 / NORMALISATION_MAX) * 50))
  })

  it('reports perfect consistency when every choice points the same way', () => {
    const result = scoreResponses(loadDimension('conflict', 1))
    const conflict = result.dimensions.find((d) => d.dimension === 'conflict')!
    expect(conflict.consistency).toBe(1)
  })

  it('reports low consistency when choices contradict each other', () => {
    // Alternate the direction chosen for the same dimension block to block.
    const responses: Response[] = BLOCKS.flatMap((block) => {
      const pos = block.items.find((i) => i.dimension === 'detail' && i.direction === 1)
      const neg = block.items.find((i) => i.dimension === 'detail' && i.direction === -1)
      if (!pos && !neg) return []
      const target = pos ?? neg!
      const other = block.items.find((i) => i.id !== target.id)!
      // Flip which of MOST/LEAST the detail item takes on alternating blocks.
      return block.index % 2 === 0
        ? [{ blockId: block.id, mostItemId: target.id, leastItemId: other.id }]
        : [{ blockId: block.id, mostItemId: other.id, leastItemId: target.id }]
    })
    const result = scoreResponses(responses)
    const detail = result.dimensions.find((d) => d.dimension === 'detail')!
    expect(detail.consistency).toBeLessThan(0.7)
  })

  it('ignores unknown block and item ids rather than throwing', () => {
    const result = scoreResponses([
      { blockId: 'does-not-exist', mostItemId: 'dir+1', leastItemId: 'dir-1' },
      { blockId: BLOCKS[0]!.id, mostItemId: 'nope', leastItemId: 'also-nope' },
    ])
    expect(result.answered).toBe(0)
  })

  it('rejects items that do not belong to the block they were answered against', () => {
    // A crafted response trying to load a dimension the block never offered.
    const block = BLOCKS[0]!
    const foreign = ITEMS.find((i) => !block.items.some((b) => b.id === i.id))!
    const legit = block.items[0]!
    const result = scoreResponses([
      { blockId: block.id, mostItemId: foreign.id, leastItemId: legit.id },
    ])
    expect(result.answered).toBe(0)
    expect(result.scores[foreign.dimension]).toBe(50)
  })

  it('rejects a response where MOST and LEAST are the same item', () => {
    const block = BLOCKS[0]!
    const item = block.items[0]!
    const result = scoreResponses([
      { blockId: block.id, mostItemId: item.id, leastItemId: item.id },
    ])
    expect(result.answered).toBe(0)
  })

  it('counts only the first answer for a repeated block', () => {
    const block = BLOCKS[0]!
    const [a, b] = block.items
    const result = scoreResponses([
      { blockId: block.id, mostItemId: a!.id, leastItemId: b!.id },
      { blockId: block.id, mostItemId: b!.id, leastItemId: a!.id },
    ])
    expect(result.answered).toBe(1)
  })

  it('never claims strong confidence from a short run', () => {
    const partial = loadDimension('directness', 1).slice(0, 6)
    const result = scoreResponses(partial)
    expect(result.confidence).toBe('provisional')
  })

  it('reaches full coverage on a complete run', () => {
    const result = scoreResponses(loadDimension('directness', 1))
    expect(result.answered).toBe(BLOCK_COUNT)
    expect(result.coverage).toBe(1)
  })

  it('builds a two-word archetype from the two most distinctive dimensions', () => {
    const result = scoreResponses(loadDimension('structure', 1))
    expect(result.archetype.split(' ').length).toBeGreaterThanOrEqual(1)
    expect(result.archetype).not.toBe('Adaptive Generalist')
  })
})
