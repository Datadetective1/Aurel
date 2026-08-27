import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * How an account becomes privileged, and how it cannot.
 *
 * These read the migration and the server actions rather than a running
 * database, because what is being asserted is the shape of the permission
 * model: which tables have write policies, what the definer functions are
 * allowed to write, and whether any path from a browser reaches the word
 * 'owner'. Those are properties of the source, and they are the properties
 * that would be quietly easy to lose in a later edit.
 *
 * The live behaviour is verified separately against production.
 */

const migration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '0015_access_tiers_and_invitations.sql'),
  'utf8',
)
const actions = readFileSync(
  join(process.cwd(), 'src', 'app', '(app)', 'settings', 'access-actions.ts'),
  'utf8',
)
const panel = readFileSync(
  join(process.cwd(), 'src', 'components', 'app', 'invitation-panel.tsx'),
  'utf8',
)

describe('the database refuses client writes', () => {
  it('gives access_grants a read policy and no write policy', () => {
    // Under RLS, absence of an insert/update/delete policy is a refusal. This
    // is the whole guarantee: however creatively a browser calls PostgREST,
    // it cannot write its own tier.
    expect(migration).toMatch(/create policy "access_grants: read own"[\s\S]*?for select/)
    expect(migration).not.toMatch(/on public\.access_grants\s+for (insert|update|delete)/)
  })

  it('gives pilot_invitations no policy at all', () => {
    // Not even select. A user who could read code_hash could attack it
    // offline; one who could list rows could enumerate live invitations.
    expect(migration).not.toMatch(/create policy[^;]*on public\.pilot_invitations/)
    expect(migration).toMatch(/alter table public\.pilot_invitations enable row level security/)
  })

  it('enables row level security on all three tables', () => {
    for (const table of ['access_grants', 'pilot_invitations', 'invitation_redemptions']) {
      expect(migration).toMatch(
        new RegExp(`alter table public\\.${table} enable row level security`),
      )
    }
  })
})

describe('what the redemption function may write', () => {
  const fn = migration.slice(
    migration.indexOf('function public.redeem_pilot_invitation'),
    migration.indexOf('function public.set_access_tier'),
  )

  it('writes the literal pilot and never takes a tier argument', () => {
    // There is no input to this function that produces an owner. That is the
    // reason a compromised server action still cannot mint one.
    //
    // 'owner' does appear in the function -- in the read that checks whether
    // the caller already has access. What matters is what it INSERTS.
    const inserts = [...fn.matchAll(/insert into public\.access_grants[\s\S]*?;/g)].map(
      (m) => m[0],
    )
    expect(inserts.length).toBeGreaterThan(0)
    for (const statement of inserts) {
      expect(statement).toMatch(/'pilot'/)
      expect(statement).not.toMatch(/'owner'/)
    }
    expect(fn).not.toMatch(/tier\s+access_tier/)
  })

  it('takes a hash, never a code', () => {
    expect(fn).toMatch(/code_hash_input text/)
    expect(fn).not.toMatch(/code_input|plain|raw_code/)
  })

  it('locks the invitation row before counting redemptions', () => {
    // Without FOR UPDATE two people can both pass the count check on the last
    // remaining use, and single-use stops being single-use.
    expect(fn).toMatch(/for update/)
  })

  it('checks revoked, expired and exhausted separately', () => {
    expect(fn).toMatch(/revoked_at is not null/)
    expect(fn).toMatch(/expires_at is not null and .*expires_at < now\(\)/)
    expect(fn).toMatch(/redemption_count >= .*max_redemptions/)
  })

  it('refuses an unauthenticated caller', () => {
    expect(fn).toMatch(/caller is null/)
  })
})

describe('who may issue invitations', () => {
  it('the owner check is a database read, not a list of emails', () => {
    // Hard-coded addresses spread through the app and go stale; a grant is one
    // row that can be revoked.
    expect(actions).not.toMatch(/@[a-z0-9.-]+\.(com|dev|io)/i)
    expect(actions).toMatch(/entitlements\.tier !== 'owner'/)
  })

  it('the setter that takes a tier is not reachable by authenticated users', () => {
    // set_access_tier is the only function that can write 'owner', so it is
    // service-role only. An authenticated user must never reach a function
    // that accepts a tier as an argument.
    expect(migration).toMatch(
      /revoke all on function public\.set_access_tier[^;]*from authenticated/,
    )
    expect(migration).not.toMatch(
      /grant execute on function public\.set_access_tier[^;]*to authenticated/,
    )
  })

  it('only the redemption function is granted to authenticated', () => {
    const grants = [...migration.matchAll(/grant execute on function public\.(\w+)/g)].map(
      (m) => m[1],
    )
    expect(grants).toEqual(['redeem_pilot_invitation'])
  })
})

describe('the client cannot promote itself', () => {
  it('the panel posts a code and nothing else', () => {
    // No tier, no user id, no role. The only thing it can influence is which
    // invitation it claims to hold.
    //
    // The panel does read tier === 'owner' to decide whether to render the
    // issuance form; reading a prop is not granting anything. What it must not
    // do is SEND one.
    const submitted = [...panel.matchAll(/name="(\w+)"/g)].map((m) => m[1]).sort()
    expect(submitted).toEqual(['code', 'label', 'maxRedemptions'])
    expect(panel).not.toMatch(/value="owner"|value="pilot"/)
  })

  it('the redeem action never reads a tier from the form', () => {
    const redeem = actions.slice(
      actions.indexOf('export async function redeemInvitation'),
      actions.indexOf('export async function createInvitation'),
    )
    expect(redeem).toMatch(/formData\.get\('code'\)/)
    expect(redeem).not.toMatch(/formData\.get\('tier'\)|formData\.get\('userId'\)/)
  })

  it('stores only a hash of the code', () => {
    expect(actions).toMatch(/createHash\('sha256'\)/)
    expect(actions).toMatch(/code_hash_input: hashCode/)
  })

  it('never logs or tracks the code itself', () => {
    const withoutComments = actions
      .split(String.fromCharCode(10))
      .filter((line) => !line.trim().startsWith('//'))
      .join(' ')
    const tracked = [...withoutComments.matchAll(/track\(\s*[^,]+,\s*\{([^}]*)\}/g)].map(
      (m) => m[1] ?? '',
    )
    for (const props of tracked) {
      expect(props).not.toMatch(/\bcode\b|hash/)
    }
    const logged = [
      ...withoutComments.matchAll(/logger\.[a-z]+\(\s*'[a-z_.]+'\s*,\s*\{([^}]*)\}/g),
    ].map((m) => m[1] ?? '')
    for (const props of logged) {
      expect(props).not.toMatch(/\bcode:\s*(raw|code)\b|hash/)
    }
  })
})

describe('revocation', () => {
  it('is a timestamp, so history survives it', () => {
    expect(migration).toMatch(/revoked_at timestamptz/)
  })

  it('is what the entitlement read filters on', () => {
    // A revoked grant stops applying on the next read -- no cache to clear,
    // no session to expire.
    const entitlements = readFileSync(
      join(process.cwd(), 'src', 'lib', 'billing', 'entitlements.ts'),
      'utf8',
    )
    expect(entitlements).toMatch(/from\('access_grants'\)[\s\S]{0,220}is\('revoked_at', null\)/)
  })
})
