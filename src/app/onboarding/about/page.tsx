import { redirect } from 'next/navigation'

export const metadata = { title: 'About you', robots: { index: false, follow: false } }

/**
 * Folded into the welcome screen, which is now the identity step. Kept as a
 * route so links and accounts parked on the `about` stage still land somewhere.
 */
export default function AboutPage() {
  redirect('/onboarding')
}
