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

describe('one redemption per user per invitation (0024)', () => {
  const once = readFileSync(
    join(
      __dirname,
      '..',
      '..',
      'supabase',
      'migrations',
      '0024_pilot_redemption_once_per_user.sql',
    ),
    'utf8',
  ).replace(/--.*$/gm, '')

  it('an existing redemption row refuses and writes nothing, so a revoked grant is not restored', () => {
    const branch = once.slice(
      once.indexOf('if inserted = 0 then'),
      once.indexOf('end if;', once.indexOf('if inserted = 0 then')),
    )
    expect(branch).toMatch(/return 'already_redeemed'/)
    expect(branch).not.toMatch(/update public\.access_grants|insert into public\.access_grants/)
  })

  it('still takes the caller from auth.uid() and stays authenticated-only', () => {
    expect(once).toMatch(/caller uuid := \(select auth\.uid\(\)\)/)
    expect(once).toMatch(
      /grant execute on function private\.redeem_pilot_invitation\(text\)\s*to authenticated;/,
    )
  })

  it('the app explains the new outcome', () => {
    const actions = readFileSync(
      join(__dirname, '..', '..', 'src', 'app', '(app)', 'settings', 'access-actions.ts'),
      'utf8',
    )
    expect(actions).toMatch(/already_redeemed:/)
  })
})
