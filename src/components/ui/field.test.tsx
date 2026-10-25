// @vitest-environment jsdom
import * as React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Select } from './field'

/**
 * A SELECT THAT STILL SHOWS WHAT WAS SAVED
 * =============================================================================
 * Found on the preview: after "Save changes", React resets the form, and every
 * select fell back (a person's time zone to "Not set", their relationship to
 * the old one, the user's own time zone to Africa/Abidjan) while the page
 * believed it still showed the saved value. A second save wrote that back.
 * =============================================================================
 */

afterEach(cleanup)

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 5)))

function Options() {
  return (
    <>
      <option value="">Not set</option>
      <option value="Europe/London">London</option>
      <option value="Asia/Tokyo">Tokyo</option>
    </>
  )
}

describe('a select inside a form that is reset', () => {
  it('a controlled select keeps the value the page holds', async () => {
    function Zone() {
      const [zone, setZone] = React.useState('')
      return (
        <form data-testid="form">
          <Select aria-label="zone" value={zone} onChange={(e) => setZone(e.currentTarget.value)}>
            <Options />
          </Select>
        </form>
      )
    }
    render(<Zone />)
    const select = screen.getByLabelText<HTMLSelectElement>('zone')
    fireEvent.change(select, { target: { value: 'Asia/Tokyo' } })
    expect(select.value).toBe('Asia/Tokyo')

    act(() => (screen.getByTestId('form') as HTMLFormElement).reset())
    await settle()
    expect(select.value).toBe('Asia/Tokyo')
  })

  it('an uncontrolled select returns to its latest default, not the one it mounted with', async () => {
    const view = (value: string) => (
      <form data-testid="form">
        <Select aria-label="zone" name="timezone" defaultValue={value}>
          <Options />
        </Select>
      </form>
    )
    const { rerender } = render(view(''))
    // The page re-renders with the value just saved.
    rerender(view('Europe/London'))
    const select = screen.getByLabelText<HTMLSelectElement>('zone')
    fireEvent.change(select, { target: { value: 'Europe/London' } })

    act(() => (screen.getByTestId('form') as HTMLFormElement).reset())
    await settle()
    expect(select.value).toBe('Europe/London')
    expect(new FormData(screen.getByTestId('form') as HTMLFormElement).get('timezone')).toBe(
      'Europe/London',
    )
  })

  it('one with neither a value nor a default resets as the browser does', async () => {
    render(
      <form data-testid="form">
        <Select aria-label="zone">
          <Options />
        </Select>
      </form>,
    )
    const select = screen.getByLabelText<HTMLSelectElement>('zone')
    fireEvent.change(select, { target: { value: 'Asia/Tokyo' } })

    act(() => (screen.getByTestId('form') as HTMLFormElement).reset())
    await settle()
    expect(select.value).toBe('')
  })

  it('after a form action succeeds, the next submission sends what was saved', async () => {
    const sent: (string | null)[] = []
    function Edit() {
      const [zone, setZone] = React.useState('')
      return (
        <form
          data-testid="form"
          action={async (data: FormData) => {
            sent.push(data.get('timezone') as string | null)
          }}
        >
          <Select
            aria-label="zone"
            name="timezone"
            value={zone}
            onChange={(e) => setZone(e.currentTarget.value)}
          >
            <Options />
          </Select>
          <button type="submit">Save</button>
        </form>
      )
    }
    render(<Edit />)
    const select = screen.getByLabelText<HTMLSelectElement>('zone')
    fireEvent.change(select, { target: { value: 'Europe/London' } })

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    await settle()
    expect(select.value).toBe('Europe/London')

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    await settle()
    expect(sent).toEqual(['Europe/London', 'Europe/London'])
  })
})
