import { redirect } from 'next/navigation'

/**
 * PREPARE is the globally prominent entry point, but it has no surface of its
 * own — preparing always means preparing for a specific interaction, so it
 * forwards straight into meeting creation, carrying any preselected person.
 */
export default async function PreparePage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string }>
}) {
  const { person } = await searchParams
  redirect(person ? `/meetings/new?person=${encodeURIComponent(person)}` : '/meetings/new')
}
