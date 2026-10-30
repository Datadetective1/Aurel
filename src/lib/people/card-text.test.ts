import { describe, expect, it } from 'vitest'
import { parseCardText } from './card-text'

/** What the phone reads off a card or a badge, sorted into a new person's fields. */
describe('parseCardText', () => {
  it('reads a business card', () => {
    const out = parseCardText([
      'NORTHWIND LABS INC.',
      'Maya Chen',
      'Director of Operations',
      'maya.chen@northwind.example',
      'Mobile: +1 (214) 555-0182',
      'www.northwind.example',
      'linkedin.com/in/mayachen',
    ])
    expect(out.fullName).toBe('Maya Chen')
    expect(out.jobTitle).toBe('Director of Operations')
    expect(out.organizationName).toBe('NORTHWIND LABS INC.')
    expect(out.email).toBe('maya.chen@northwind.example')
    expect(out.profileUrl).toBe('https://linkedin.com/in/mayachen')
    expect(out.notes).toBe('Phone: +1 (214) 555-0182\nWebsite: www.northwind.example')
  })

  it('reads a conference badge with the name in capitals over two lines', () => {
    const out = parseCardText(['SPEAKER', 'DANIEL', 'RUIZ', 'Principal Engineer', 'Globex'])
    expect(out.fullName).toBe('Daniel Ruiz')
    expect(out.jobTitle).toBe('Principal Engineer')
    expect(out.organizationName).toBe('Globex')
  })

  it('takes the company from a work email when the card does not print one', () => {
    const out = parseCardText(['Priya Nair', 'Product Lead', 'priya@halden.com'])
    expect(out.organizationName).toBe('Halden')
    expect(parseCardText(['Lucas Moreau', 'lucas.m@gmail.com']).organizationName).toBe('')
  })

  it('leaves a field empty rather than guess wildly', () => {
    const out = parseCardText(['12 Elm Street, Suite 4', ''])
    expect(out.fullName).toBe('')
    expect(out.email).toBe('')
  })
})
