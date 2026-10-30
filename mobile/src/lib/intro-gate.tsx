import * as React from 'react'
import { introSeen, markIntroSeen } from './intro'

/**
 * Holds whether this install has seen the introduction, so the navigator can
 * show it first and every screen after it can end it. `null` while the
 * stored answer is read, which keeps the splash up rather than flashing a
 * screen.
 */
const IntroContext = React.createContext<{ seen: boolean | null; finish: () => void }>({ seen: true, finish: () => {} })

export function IntroGateProvider({ children }: { children: React.ReactNode }) {
  const [seen, setSeen] = React.useState<boolean | null>(null)
  React.useEffect(() => {
    let live = true
    void introSeen().then((v) => {
      if (live) setSeen(v)
    })
    return () => {
      live = false
    }
  }, [])
  const finish = React.useCallback(() => {
    setSeen(true)
    void markIntroSeen()
  }, [])
  const value = React.useMemo(() => ({ seen, finish }), [seen, finish])
  return <IntroContext.Provider value={value}>{children}</IntroContext.Provider>
}

export function useIntroGate() {
  return React.useContext(IntroContext)
}
