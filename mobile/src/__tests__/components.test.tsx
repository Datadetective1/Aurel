import * as React from 'react'
import { render, screen } from '@testing-library/react-native'
import { MeetingCard, LoopRow } from '../components/relationship'
import { DirectionChip, PrepChip } from '../components/chip'
import { ThemeProvider } from '../theme'

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))

const wrap = async (ui: React.ReactElement) => await render(<ThemeProvider force="pearl">{ui}</ThemeProvider>)

const person = {
  id: 'p1',
  name: 'Columbus Brown',
  fullName: 'Columbus Brown',
  src: null,
  title: 'VP',
  company: 'Halden Telecom',
  companyDomain: null,
  context: 'Decision maker',
  lastInteractionAt: null,
  openLoops: 2,
  owe: 1,
}

describe('visual components', () => {
  it('a meeting card says who, when, whether it is prepared and what is owed', async () => {
    await wrap(
      <MeetingCard
        meeting={{ id: 'm1', title: 'Prototype review', scheduledAt: '2026-10-13T15:00:00Z', objective: null, prep: 'ready', people: [person], openLoops: 2 }}
        timeZone="UTC"
        now={new Date('2026-10-13T14:00:00Z')}
      />,
    )
    expect(screen.getByText('Prototype review')).toBeTruthy()
    expect(screen.getByText('Brief ready')).toBeTruthy()
    expect(screen.getByText('You owe 1')).toBeTruthy()
    expect(screen.getByLabelText(/Prototype review, Today · 3:00 PM, with Columbus/)).toBeTruthy()
  })

  it('a loop row is labelled by direction for VoiceOver, not by colour', async () => {
    await wrap(
      <LoopRow
        loop={{ id: 'l1', description: 'Send the deck', direction: 'owe', dueOn: null, overdue: true, personId: 'p1', personName: 'Columbus', interactionId: null }}
        timeZone="UTC"
        now={new Date()}
      />,
    )
    expect(screen.getByLabelText('I owe them, Columbus: Send the deck, overdue')).toBeTruthy()
  })

  it('chips carry words', async () => {
    await wrap(<><DirectionChip direction="waiting" count={2} short /><PrepChip prep="not_prepared" /></>)
    expect(screen.getByText('2 Waiting')).toBeTruthy()
    expect(screen.getByText('Not prepared')).toBeTruthy()
  })
})
