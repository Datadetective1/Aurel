import { describe, expect, it } from 'vitest'
import { isBlockedAddress, parseUrl } from './fetch'

/**
 * SSRF guard tests.
 *
 * These encode the boundary that stops a user-supplied URL from reaching
 * internal infrastructure. Every case here is an address an attacker would
 * actually try.
 */

describe('parseUrl', () => {
  it('accepts http and https', () => {
    expect(parseUrl('https://example.com/a')?.protocol).toBe('https:')
    expect(parseUrl('http://example.com')?.protocol).toBe('http:')
  })

  it('assumes https for a bare domain', () => {
    expect(parseUrl('example.com/leadership')?.toString()).toBe('https://example.com/leadership')
  })

  it('rejects non-http schemes', () => {
    for (const url of [
      'file:///etc/passwd',
      'ftp://example.com',
      'gopher://example.com',
      'data:text/html,<script>alert(1)</script>',
      'javascript:alert(1)',
    ]) {
      expect(parseUrl(url), url).toBeNull()
    }
  })

  it('rejects empty and malformed input', () => {
    expect(parseUrl('')).toBeNull()
    expect(parseUrl('   ')).toBeNull()
    expect(parseUrl('http://')).toBeNull()
  })
})

describe('isBlockedAddress', () => {
  it('blocks IPv4 loopback', () => {
    expect(isBlockedAddress('127.0.0.1')).toBe(true)
    expect(isBlockedAddress('127.255.255.254')).toBe(true)
  })

  it('blocks the cloud metadata endpoint', () => {
    // The single most important case: this is how instance credentials leak.
    expect(isBlockedAddress('169.254.169.254')).toBe(true)
  })

  it('blocks RFC1918 private ranges', () => {
    expect(isBlockedAddress('10.0.0.1')).toBe(true)
    expect(isBlockedAddress('172.16.0.1')).toBe(true)
    expect(isBlockedAddress('172.31.255.255')).toBe(true)
    expect(isBlockedAddress('192.168.1.1')).toBe(true)
  })

  it('allows public addresses adjacent to private ranges', () => {
    expect(isBlockedAddress('172.15.0.1')).toBe(false)
    expect(isBlockedAddress('172.32.0.1')).toBe(false)
    expect(isBlockedAddress('192.167.1.1')).toBe(false)
    expect(isBlockedAddress('11.0.0.1')).toBe(false)
  })

  it('blocks unspecified, CGNAT and multicast', () => {
    expect(isBlockedAddress('0.0.0.0')).toBe(true)
    expect(isBlockedAddress('100.64.0.1')).toBe(true)
    expect(isBlockedAddress('224.0.0.1')).toBe(true)
    expect(isBlockedAddress('255.255.255.255')).toBe(true)
  })

  it('allows ordinary public addresses', () => {
    expect(isBlockedAddress('8.8.8.8')).toBe(false)
    expect(isBlockedAddress('93.184.216.34')).toBe(false)
    expect(isBlockedAddress('1.1.1.1')).toBe(false)
  })

  it('blocks IPv6 loopback, link-local and unique-local', () => {
    expect(isBlockedAddress('::1')).toBe(true)
    expect(isBlockedAddress('::')).toBe(true)
    expect(isBlockedAddress('fe80::1')).toBe(true)
    expect(isBlockedAddress('fc00::1')).toBe(true)
    expect(isBlockedAddress('fd12:3456::1')).toBe(true)
  })

  it('blocks IPv4-mapped IPv6 pointing at loopback', () => {
    // ::ffff:127.0.0.1 resolves to loopback but is not literally an IPv4 string.
    expect(isBlockedAddress('::ffff:127.0.0.1')).toBe(true)
    expect(isBlockedAddress('::ffff:169.254.169.254')).toBe(true)
  })

  it('allows public IPv6', () => {
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false)
  })

  it('blocks anything that is not a literal IP', () => {
    // Hostnames must be resolved first; treating them as allowed would defeat
    // the whole check.
    expect(isBlockedAddress('example.com')).toBe(true)
    expect(isBlockedAddress('localhost')).toBe(true)
    expect(isBlockedAddress('')).toBe(true)
  })
})
