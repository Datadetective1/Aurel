import Link from 'next/link'
import { MessageSquare, MessagesSquare, Mic, Settings2, Sparkles } from 'lucide-react'
import { PersonHero } from '@/components/app/person-hero'
import { Button } from '@/components/ui/button'
import { relevanceChip } from '@/lib/visual/relevance'

/** The person page's hero with the page's own facts and actions. */
export function PersonHeroView({
  personId,
  name,
  fullName,
  src,
  title,
  company,
  companyDomain,
  relevance,
  relationship,
}: {
  personId: string
  name: string
  fullName: string
  src: string | null
  title: string | null
  company: string | null
  companyDomain: string | null
  relevance: number
  relationship: string
}) {
  const first = name.split(' ')[0]
  return (
    <PersonHero
      personId={personId}
      name={name}
      fullName={fullName}
      src={src}
      title={title}
      company={company}
      companyDomain={companyDomain}
      facts={[
        { label: relationship },
        ...(relevanceChip(relevance)
          ? [{ label: relevanceChip(relevance)!, tone: 'accent' as const, hint: 'You set this' }]
          : []),
      ]}
      actions={
        <>
          <Button asChild>
            <Link href={`/prepare?person=${personId}`}>
              <Sparkles className="size-4" aria-hidden="true" />
              Prepare
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/conversations/new?person=${personId}`}>
              <Mic className="size-4" aria-hidden="true" />
              Capture
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/coach?person=${personId}`}>
              <MessagesSquare className="size-4" aria-hidden="true" />
              Ask
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label={`Draft a message to ${first}`}
          >
            <Link href={`/coach?person=${personId}&mode=adapt`}>
              <MessageSquare className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label={`Edit ${name}`}
          >
            <Link href={`/people/${personId}/edit`}>
              <Settings2 className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </>
      }
    />
  )
}
