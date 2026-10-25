import * as React from 'react'

/** The value once it has stopped changing for `ms`: a search per pause, not per letter. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [settled, setSettled] = React.useState(value)
  React.useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return settled
}
