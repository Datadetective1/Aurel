import * as React from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { ThemeProvider } from '../theme'

/**
 * FIRST RUN, FROM THE FIRST TESTERS
 * =============================================================================
 * One tester could not tell what Atturel was for until they clicked around;
 * another added a person by first name only and got nothing back. These are
 * the answers to both: the introduction a new install sees first, and the
 * new-person form saying what it needs before it saves.
 * =============================================================================
 */

jest.mock('~/lib/config', () => ({
  config: { apiUrl: 'https://www.atturel.com', supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon', previewData: true },
}))
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true } }))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)

const mockPost = jest.fn()
jest.mock('~/lib/api', () => ({
  api: { post: (...args: unknown[]) => mockPost(...args) },
  ApiError: class ApiError extends Error {},
  useApi: () => ({ data: null, loading: false, reload: jest.fn() }),
}))

import { Intro, INTRO_PAGES } from '../components/intro'
import { NewPerson } from '../components/people-picker'
import { resolve } from '../components/avatar'

const wrap = async (ui: React.ReactElement) => await render(<ThemeProvider force="pearl">{ui}</ThemeProvider>)

describe('the introduction', () => {
  it('walks four pages and ends where the user asked to start', async () => {
    const done = jest.fn()
    await wrap(<Intro onDone={done} />)
    expect(screen.getByText(INTRO_PAGES[0]!.title)).toBeTruthy()
    expect(screen.getByLabelText('Page 1 of 4')).toBeTruthy()

    for (let i = 2; i <= 4; i++) {
      await fireEvent.press(screen.getByText('Next'))
      expect(screen.getByLabelText(`Page ${i} of 4`)).toBeTruthy()
    }
    expect(done).not.toHaveBeenCalled()
    await fireEvent.press(screen.getByText('Get started'))
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('can be skipped from the first page', async () => {
    const done = jest.fn()
    await wrap(<Intro onDone={done} />)
    await fireEvent.press(screen.getByLabelText('Skip the introduction'))
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('opened again from Account, it closes rather than skips', async () => {
    const done = jest.fn()
    await wrap(<Intro onDone={done} replay />)
    await fireEvent.press(screen.getByLabelText('Close'))
    expect(done).toHaveBeenCalledTimes(1)
  })

  it('says what to enter for a person, in plain words', () => {
    const person = INTRO_PAGES[1]!
    expect(`${person.title} ${person.body}`).toMatch(/full name/i)
    expect(`${person.title} ${person.body}`).toMatch(/company/i)
    expect(person.body).toMatch(/notes yourself/i)
  })

  it('reads as written by a person: no dashes standing in for punctuation', () => {
    for (const p of INTRO_PAGES) {
      for (const text of [p.eyebrow, p.title, p.body]) expect(text).not.toMatch(/—|–|--/)
    }
  })
})

describe('adding someone new', () => {
  beforeEach(() => mockPost.mockReset())

  it('asks for a last name before saving a first name alone, then lets it through', async () => {
    mockPost.mockResolvedValue({ ok: true, personId: 'p-new' })
    const added = jest.fn()
    await wrap(<NewPerson initialName="Alou" onCancel={jest.fn()} onAdded={added} onExisting={jest.fn()} />)

    await fireEvent.press(screen.getByText('Add'))
    expect(mockPost).not.toHaveBeenCalled()
    expect(screen.getByText(/A first name alone is not enough/)).toBeTruthy()

    await fireEvent.press(screen.getByText('Add anyway'))
    expect(mockPost).toHaveBeenCalledTimes(1)
  })

  it('a full name goes straight through', async () => {
    mockPost.mockResolvedValue({ ok: true, personId: 'p-new' })
    await wrap(<NewPerson initialName="Alou Traore" onCancel={jest.fn()} onAdded={jest.fn()} onExisting={jest.fn()} />)
    await fireEvent.press(screen.getByText('Add'))
    expect(mockPost).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/A first name alone/)).toBeNull()
  })
})

describe('sample portraits', () => {
  it('ship inside the app, so they match this build', () => {
    // A bundled asset, not a link to the website.
    const face = resolve('/demo/faces/maya.webp')
    expect(face).not.toBeNull()
    expect(typeof face).not.toBe('string')
    // Accounts seeded with the old drawings get the same bundled photo.
    expect(resolve('/demo/faces/maya.svg')).toBe(face)
    expect(resolve('/people/someone.webp')).toBe('https://www.atturel.com/people/someone.webp')
    expect(resolve('https://example.com/a.jpg')).toBe('https://example.com/a.jpg')
  })
})
