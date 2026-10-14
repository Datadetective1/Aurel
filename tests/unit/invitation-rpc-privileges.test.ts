import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Migration 0023: the invitation functions are not reachable without signing
 * in, and no elevated function stays in the API schema. Supabase's default
 * privileges grant EXECUTE to anon on every new public function, which is how
 * 0015's `revoke ... from public` left anon able to call both.
 */
const sql = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '0023_pilot_invitation_rpc_privileges.sql'),
  'utf8',
).replace(/--.*$/gm, '')

describe('pilot invitation RPC privileges (0023)', () => {
  for (const fn of ['create_pilot_invitation', 'redeem_pilot_invitation']) {
    it(`${fn}: the privileged body lives in private, the API entry point is an invoker wrapper`, () => {
      expect(sql).toMatch(new RegExp(`function private\\.${fn}\\([\\s\\S]*?security definer`))
      expect(sql).toMatch(new RegExp(`function public\\.${fn}\\([\\s\\S]*?security invoker`))
    })

    it(`${fn}: anon and service_role lose EXECUTE explicitly; only authenticated is granted`, () => {
      for (const schema of ['private', 'public']) {
        expect(sql).toMatch(
          new RegExp(
            `revoke all on function ${schema}\\.${fn}\\([^)]*\\)\\s*from public, anon, authenticated, service_role;`,
          ),
        )
        expect(sql).toMatch(
          new RegExp(`grant execute on function ${schema}\\.${fn}\\([^)]*\\)\\s*to authenticated;`),
        )
        expect(sql).not.toMatch(
          new RegExp(`grant execute on function ${schema}\\.${fn}\\([^)]*\\)\\s*to [^;]*anon`),
        )
      }
    })
  }

  it('redemption takes no recipient: the caller is always auth.uid()', () => {
    expect(sql).toMatch(/function private\.redeem_pilot_invitation\(code_hash_input text\)/)
    expect(sql).toMatch(/caller uuid := \(select auth\.uid\(\)\)/)
  })

  it('creation ignores a supplied created_by and requires an active owner grant', () => {
    expect(sql).toMatch(/g\.tier = 'owner'/)
    expect(sql).toMatch(/expires_at_input, caller\)/)
  })
})
