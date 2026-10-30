import { router } from 'expo-router'
import { Intro } from '~/components/intro'
export { RouteError as ErrorBoundary } from '~/components/route-error'

/** The same introduction, opened again from Account. */
export default function HowItWorks() {
  return <Intro replay onDone={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
}
