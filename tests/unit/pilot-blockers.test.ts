import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * PILOT BLOCKERS
 * =============================================================================
 * Four defects a pilot user would have hit in their first session. Each was
 * invisible to the type checker and to every existing test, which is why each
 * one shipped.
 *
 * These are source-reading assertions. They are blunt, but the alternative for
 * a responsive-visibility rule or a grid column count is a full browser render,
 * and a test that never runs protects nothing.
 * =============================================================================
 */

const SRC = join(__dirname, '..', '..', 'src')
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8')

/**
 * Comments explain the fixes below, and several quote the very strings these
 * tests forbid. Without stripping them, every assertion here fails on its own
 * documentation — which has happened before in this suite.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('a returning user can sign in on a phone', () => {
  const header = stripComments(read('app', '(marketing)', 'layout.tsx'))

  it('does not hide the sign-in control below a breakpoint', () => {
    // The regression: `hidden sm:inline-flex` on the Sign in button. Below
    // 640px the only control left was "Start free", and the section nav had
    // already gone at 768px with no menu behind it -- so somebody who already
    // had an account had no way into it but to type the URL.
    //
    // Scoped to the Button element that actually wraps the sign-in link. A
    // window of surrounding characters also catches the ThemeToggle, which is
    // legitimately hidden on mobile, and would fail on a correct file.
    const signInButton = header.match(/<Button[^>]*>\s*<Link href="\/sign-in">/)
    expect(signInButton, 'sign-in button not found in the header').not.toBeNull()
    expect(signInButton![0]).not.toMatch(/\bhidden\b/)
  })

  it('still offers both paths, so neither audience is stranded', () => {
    expect(header).toContain('/sign-in')
    expect(header).toContain('/sign-up')
  })
})

describe('the mobile tab bar fills its row', () => {
  const nav = stripComments(read('components', 'app', 'nav.tsx'))

  it('derives its columns from the item list rather than a fixed count', () => {
    // The regression: `grid-cols-5` while MOBILE_ITEMS held four, because
    // Atlas is filtered out. Four tabs sat in the left four fifths of the bar
    // with a dead column on the right.
    expect(nav).not.toMatch(/grid-cols-\d/)
    expect(nav).toMatch(/auto-cols-fr/)
  })

  it('keeps the mobile list a filtered view of the one nav definition', () => {
    // Two hand-maintained lists would drift the same way again.
    expect(nav).toMatch(/MOBILE_ITEMS\s*=\s*NAV_ITEMS\.filter/)
  })

  it('preserves safe-area padding and the touch-target height', () => {
    expect(nav).toContain('env(safe-area-inset-bottom)')
    expect(nav).toMatch(/h-14/)
  })
})

describe('Today does not wait on the model before rendering', () => {
  const today = stripComments(read('app', '(app)', 'today', 'page.tsx'))

  it('does not await the daily focus generation in the page body', () => {
    // The regression: `await runPrompt(dailyFocusPrompt, ...)` inline, behind a
    // 45s timeout and two attempts. Nothing on the page rendered until the
    // model answered -- not the greeting, not the meetings, not the
    // commitments, none of which need it.
    expect(today).not.toMatch(/await\s+runPrompt\(/)
  })

  it('hands the promise to a Suspense boundary instead', () => {
    expect(today).toMatch(/<Suspense/)
    expect(today).toMatch(/focusPromise/)
  })

  it('shows a fallback that describes work rather than faking content', () => {
    // A skeleton here would claim a headline exists before there is one, on
    // the screen whose whole argument is that it does not assert what it
    // cannot support.
    expect(today).toMatch(/FocusPending/)
    expect(today).not.toMatch(/<Skeleton[^>]*>[\s\S]{0,200}Today&rsquo;s focus/)
  })
})

describe('a dead end still looks like the product', () => {
  it('has a branded 404 with a route back in', () => {
    const notFound = read('app', 'not-found.tsx')
    expect(notFound).toMatch(/\/today/)
    expect(stripComments(notFound)).not.toMatch(/Oops/i)
  })

  it('has a route error boundary that offers a retry', () => {
    const error = stripComments(read('app', 'error.tsx'))
    expect(error).toMatch(/'use client'|"use client"/)
    expect(error).toMatch(/reset\(\)|onClick=\{reset\}/)
  })

  it('never renders the raw error message to the user', () => {
    // error.message can carry a database constraint, a row id, or a fragment
    // of somebody's relationship record. The digest is enough to find the real
    // error in the logs.
    const error = stripComments(read('app', 'error.tsx'))
    expect(error).not.toMatch(/\{error\.message\}/)
    expect(error).toMatch(/error\.digest/)
  })

  it('has a last-resort boundary that renders its own document', () => {
    const globalError = stripComments(read('app', 'global-error.tsx'))
    expect(globalError).toMatch(/<html/)
    expect(globalError).toMatch(/<body/)
    // It must not depend on the component layer it exists to survive.
    expect(globalError).not.toMatch(/from '@\/components/)
  })
})
