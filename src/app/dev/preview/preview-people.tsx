import { PeopleCards, type PersonCardData } from '@/components/app/people-cards'

/** The People page's list, exactly as the page renders it. */
export function PeopleList({ people, className }: { people: PersonCardData[]; className?: string }) {
  return <PeopleCards people={people} className={className} />
}
