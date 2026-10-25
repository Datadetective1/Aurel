/**
 * How the user relates to someone, as the person form asks it: the stored
 * value and the words for it. Shared by the web form and the phone's editor,
 * so the two never offer different lists.
 */
export const RELATIONSHIP_OPTIONS = [
  { value: 'manager', label: 'My manager' },
  { value: 'report', label: 'My direct report' },
  { value: 'skip_level', label: 'My skip-level' },
  { value: 'peer', label: 'A peer' },
  { value: 'cross_functional', label: 'Cross-functional partner' },
  { value: 'customer', label: 'A customer' },
  { value: 'prospect', label: 'A prospect' },
  { value: 'vendor', label: 'A vendor' },
  { value: 'partner', label: 'A partner' },
  { value: 'candidate', label: 'A candidate' },
  { value: 'mentor', label: 'My mentor' },
  { value: 'external', label: 'External contact' },
  { value: 'other', label: 'Other' },
] as const
