import * as React from 'react'
import * as fs from 'fs'
import * as path from 'path'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { RouteError } from '../components/route-error'
import { ThemeProvider } from '../theme'

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)

describe('a screen that throws does not close the app', () => {
  it('shows what happened and renders the screen again on "Try again"', async () => {
    const retry = jest.fn(async () => {})
    await render(
      <ThemeProvider force="pearl">
        <RouteError error={new TypeError('Intl.RelativeTimeFormat is not a constructor')} retry={retry} />
      </ThemeProvider>,
    )
    expect(screen.getByText('This screen could not be shown')).toBeTruthy()
    expect(screen.getByText('Intl.RelativeTimeFormat is not a constructor')).toBeTruthy()
    fireEvent.press(screen.getByText('Try again'))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('every screen exports it as its ErrorBoundary', () => {
    const app = path.join(__dirname, '..', 'app')
    const screens: string[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.name.endsWith('.tsx') && entry.name !== '_layout.tsx') screens.push(full)
      }
    }
    walk(app)
    expect(screens.length).toBeGreaterThan(10)
    const missing = screens
      .filter((file) => !fs.readFileSync(file, 'utf8').includes("export { RouteError as ErrorBoundary } from '~/components/route-error'"))
      .map((file) => path.relative(app, file))
    expect(missing).toEqual([])
  })
})
