import { Intro } from '~/components/intro'
import { useIntroGate } from '~/lib/intro-gate'
export { RouteError as ErrorBoundary } from '~/components/route-error'

/** First launch on this iPhone: how Atturel works, before anything else. */
export default function FirstIntro() {
  const { finish } = useIntroGate()
  return <Intro onDone={finish} />
}
