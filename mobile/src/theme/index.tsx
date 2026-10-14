import * as React from 'react'
import { useColorScheme } from 'react-native'
import { obsidian, pearl, type Palette } from './tokens'

export * from './tokens'

export type ThemeName = 'pearl' | 'obsidian'

const ThemeContext = React.createContext<{ name: ThemeName; c: Palette }>({ name: 'pearl', c: pearl })

/** Follows the device, like the web's System setting. */
export function ThemeProvider({ children, force }: { children: React.ReactNode; force?: ThemeName }) {
  const scheme = useColorScheme()
  const name: ThemeName = force ?? (scheme === 'dark' ? 'obsidian' : 'pearl')
  const value = React.useMemo(() => ({ name, c: name === 'obsidian' ? obsidian : pearl }), [name])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return React.useContext(ThemeContext)
}
