import { describe, expect, it } from 'vitest'
import { accessStatusFor, classifyRead } from './ingest'

/**
 * WHY A PAGE COULD NOT BE READ
 * =============================================================================
 * A user pasted a public Facebook profile and was told "There was not enough
 * readable text on that page." The page is not short of text — the site sends
 * half a megabyte of markup whose content is assembled by JavaScript a fetch
 * never runs. The message blamed the content for what was really a limit on
 * automated access, and made the product sound broken.
 *
 * The byte counts below are measured, not invented: each was fetched once with
 * the product's own user agent and run through the real extractor.
 * =============================================================================
 */

/** Observed values, so the thresholds are pinned to reality rather than taste. */
const MEASURED = {
  facebook: { bytes: 495_061, text: 15 },
  instagram: { bytes: 722_450, text: 115 },
  x: { bytes: 26_643, text: 25 },
  exampleCom: { bytes: 559, text: 142 },
  linkedin: { bytes: 598_246, text: 32_239 },
  wikipedia: { bytes: 478_752, text: 35_404 },
}

const read = (bytes: number, textLength: number, over: Partial<Parameters<typeof classifyRead>[0]> = {}) =>
  classifyRead({
    text: 'x'.repeat(textLength),
    title: null,
    bytes,
    finalUrl: 'https://example.com/page',
    submittedUrl: 'https://example.com/page',
    ...over,
  })

describe('a page that reads fine is left alone', () => {
  it('accepts a normal article', () => {
    expect(read(MEASURED.wikipedia.bytes, MEASURED.wikipedia.text)).toBeNull()
  })

  it('accepts a site that renders server-side even though it is large', () => {
    // LinkedIn extracts 32k of text. It must never be swept up by a rule aimed
    // at client-rendered pages -- which is one reason there is no host list.
    expect(read(MEASURED.linkedin.bytes, MEASURED.linkedin.text)).toBeNull()
  })

  it('accepts a small page that still says something', () => {
    expect(read(3_000, 400)).toBeNull()
  })
})

describe('a large document that yields nothing readable is reported as restricted', () => {
  it('classifies the page from the original report', () => {
    const result = read(MEASURED.facebook.bytes, MEASURED.facebook.text)
    expect(result?.status).toBe('limited_access')
    expect(result?.message).toMatch(/couldn’t read this page/i)
    expect(result?.message).toMatch(/some sites limit automated access/i)
  })

  it('classifies the other client-rendered profiles the same way', () => {
    for (const page of [MEASURED.instagram, MEASURED.x]) {
      expect(read(page.bytes, page.text)?.status).toBe('limited_access')
    }
  })

  it('offers the user something to do instead', () => {
    const result = read(MEASURED.facebook.bytes, MEASURED.facebook.text)
    expect(result?.message).toMatch(/paste/i)
    expect(result?.message).toMatch(/attach a document/i)
  })

  it('does not name a site or accuse anyone of blocking', () => {
    const result = read(MEASURED.facebook.bytes, MEASURED.facebook.text)!
    expect(result.message).not.toMatch(/facebook|instagram|linkedin|twitter/i)
    // "Blocked" is a claim about intent that this evidence cannot support.
    expect(result.message).not.toMatch(/\bblocked\b|\bbot\b|\bcrawler\b/i)
  })
})

describe('a genuinely sparse page is reported as sparse', () => {
  it('does not accuse a small page of restricting anything', () => {
    // example.com is 559 bytes with 142 characters. It is small, not withheld,
    // and telling somebody a site limited us would be false.
    const result = read(MEASURED.exampleCom.bytes, MEASURED.exampleCom.text)
    expect(result?.status).toBe('content_unavailable')
    expect(result?.message).toMatch(/wasn’t enough readable information/i)
    expect(result?.message).not.toMatch(/limit automated access/i)
  })

  it('separates the two cases on document size, not on text alone', () => {
    // Same empty extraction, different documents, different answers.
    expect(read(600, 20)?.status).toBe('content_unavailable')
    expect(read(200_000, 20)?.status).toBe('limited_access')
  })
})

describe('a redirect into a sign-in page is restricted', () => {
  it('is caught even when the document is small', () => {
    const result = read(1_200, 30, {
      finalUrl: 'https://site.example/login?next=%2Fprofile',
      submittedUrl: 'https://site.example/profile',
    })
    expect(result?.status).toBe('limited_access')
  })

  it('recognises the usual auth paths', () => {
    for (const path of ['/login', '/signin', '/sign-in', '/auth', '/authwall', '/checkpoint']) {
      const result = read(1_200, 30, {
        finalUrl: `https://site.example${path}`,
        submittedUrl: 'https://site.example/profile',
      })
      expect(result?.status, path).toBe('limited_access')
    }
  })

  it('does not fire when the page was not redirected', () => {
    // A page that simply lives at /login and reads fine is not a wall.
    expect(
      read(1_200, 30, {
        finalUrl: 'https://site.example/login',
        submittedUrl: 'https://site.example/login',
      })?.status,
    ).toBe('content_unavailable')
  })
})

describe('a page that says in words that it needs an account keeps the specific answer', () => {
  it('still reports a login wall', () => {
    const result = classifyRead({
      text: 'Sign in to continue reading this profile.',
      title: null,
      bytes: 40_000,
      finalUrl: 'https://site.example/p',
      submittedUrl: 'https://site.example/p',
    })
    expect(result?.status).toBe('login_required')
  })

  it('still reports a paywall', () => {
    const result = classifyRead({
      text: 'Subscribe to read the rest of this article.',
      title: null,
      bytes: 40_000,
      finalUrl: 'https://site.example/p',
      submittedUrl: 'https://site.example/p',
    })
    expect(result?.status).toBe('paywall')
  })
})

describe('fetch failures say which failure it was', () => {
  it('treats 401 and 403 as the site declining', () => {
    for (const status of [401, 403]) {
      const result = accessStatusFor({ reason: 'http_error', status })
      expect(result.status).toBe('limited_access')
      expect(result.message).toMatch(/some sites limit automated access/i)
    }
  })

  it('treats other HTTP errors as a missing page, not a restricted one', () => {
    const result = accessStatusFor({ reason: 'http_error', status: 404 })
    expect(result.message).toMatch(/may have moved/i)
    expect(result.message).not.toMatch(/limit automated access/i)
  })

  it('reports an unreachable page as unreachable', () => {
    expect(accessStatusFor({ reason: 'network_error' }).message).toMatch(
      /couldn’t reach this page.*try again/i,
    )
    expect(accessStatusFor({ reason: 'dns_failure' }).message).toMatch(/couldn’t reach this page/i)
  })

  it('reports a timeout without implying the link is wrong', () => {
    expect(accessStatusFor({ reason: 'timeout' }).message).toMatch(/took too long/i)
  })

  it('asks for a valid address when the address is not one', () => {
    expect(accessStatusFor({ reason: 'invalid_url' }).message).toBe('Enter a valid web address.')
    expect(accessStatusFor({ reason: 'blocked_scheme' }).message).toBe('Enter a valid web address.')
  })
})

describe('nothing here sounds like a system error', () => {
  const messages = [
    read(MEASURED.facebook.bytes, MEASURED.facebook.text)!.message,
    read(MEASURED.exampleCom.bytes, MEASURED.exampleCom.text)!.message,
    accessStatusFor({ reason: 'network_error' }).message,
    accessStatusFor({ reason: 'http_error', status: 403 }).message,
    accessStatusFor({ reason: 'invalid_url' }).message,
  ]

  it('never shouts, apologises or blames the user', () => {
    for (const message of messages) {
      expect(message).not.toMatch(/!/)
      expect(message).not.toMatch(/oops|sorry|error|failed|invalid input/i)
      expect(message).not.toMatch(/you (?:entered|typed|gave)/i)
    }
  })

  it('reads as a sentence, not a status code', () => {
    for (const message of messages) {
      expect(message.length).toBeGreaterThan(20)
      expect(message).toMatch(/[.]$/)
    }
  })
})
