#!/usr/bin/env node
/**
 * Checks that a Stripe key can do everything the Atturel server does, and
 * nothing is charged doing it.
 *
 *   read -rs STRIPE_SECRET_KEY && export STRIPE_SECRET_KEY
 *   STRIPE_PRICE_PRO_MONTHLY=price_... node scripts/verify-stripe-key.mjs
 *
 * `read -rs` keeps the key out of shell history and off the screen. The key is
 * never printed. No dependencies; Node 18+.
 *
 * What it does, in the order the product does it:
 *   - reads the Pro price and checks it is $29.00 USD monthly
 *   - creates a throwaway customer ("Atturel key check")
 *   - creates a Checkout Session for it, lists open sessions, expires it
 *   - creates a Billing Portal session for it
 *   - lists its subscriptions and open invoices
 *   - proves retrieve/cancel subscription and void invoice are permitted by
 *     calling them on ids that do not exist: 404 means allowed, 403 means not
 *   - deletes the throwaway customer
 * No payment method is attached, no subscription is created, nothing is paid.
 */

const key = process.env.STRIPE_SECRET_KEY
const priceId = process.env.STRIPE_PRICE_PRO_MONTHLY
const site = 'https://www.atturel.com'

if (!key || !priceId) {
  console.error('Set STRIPE_SECRET_KEY and STRIPE_PRICE_PRO_MONTHLY first.')
  process.exit(2)
}
const mode = /^(sk|rk)_live_/.test(key) ? 'live' : /^(sk|rk)_test_/.test(key) ? 'test' : 'unknown'
console.log(`Key: ${key.slice(0, 3)}… (${mode} mode, value not shown)`)

async function call(method, path, params) {
  const body = params ? new URLSearchParams(params).toString() : undefined
  const url = `https://api.stripe.com/v1${path}${method === 'GET' && body ? `?${body}` : ''}`
  let res
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: method === 'GET' ? undefined : body,
    })
  } catch (error) {
    return {
      status: 0,
      json: { error: { message: `network error: ${error.cause?.code ?? error.message}` } },
    }
  }
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

const results = []
function record(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}
const why = (r) => r.json?.error?.message?.replace(key, '[key]') ?? `HTTP ${r.status}`

/** Allowed but absent: 404 resource_missing. Not allowed: 403. */
async function permitted(name, method, path) {
  const r = await call(method, path)
  const ok = r.status === 404
  record(name, ok, ok ? 'permitted' : why(r))
}

let customerId = null
try {
  // Checkout: the price is verified against the offer before a session is made.
  const price = await call('GET', `/prices/${priceId}`)
  const p = price.json
  record(
    'Prices: read the Pro price',
    price.status === 200 &&
      p.active &&
      p.unit_amount === 2900 &&
      p.currency === 'usd' &&
      p.recurring?.interval === 'month' &&
      p.recurring?.interval_count === 1,
    price.status === 200
      ? `${p.unit_amount} ${p.currency}/${p.recurring?.interval}, livemode=${p.livemode}`
      : why(price),
  )

  const customer = await call('POST', '/customers', {
    name: 'Atturel key check',
    'metadata[purpose]': 'restricted-key-verification',
  })
  customerId = customer.json?.id ?? null
  record('Customers: create', customer.status === 200, customer.status === 200 ? '' : why(customer))

  if (customerId) {
    const session = await call('POST', '/checkout/sessions', {
      mode: 'subscription',
      customer: customerId,
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      allow_promotion_codes: 'false',
      success_url: `${site}/settings/billing?checkout=success`,
      cancel_url: `${site}/settings/billing?checkout=canceled`,
    })
    record(
      'Checkout Sessions: create',
      session.status === 200,
      session.status === 200 ? '' : why(session),
    )

    const open = await call('GET', '/checkout/sessions', {
      customer: customerId,
      status: 'open',
      limit: '10',
    })
    record('Checkout Sessions: list', open.status === 200, open.status === 200 ? '' : why(open))

    if (session.json?.id) {
      const expired = await call('POST', `/checkout/sessions/${session.json.id}/expire`)
      record(
        'Checkout Sessions: expire',
        expired.status === 200,
        expired.status === 200 ? '' : why(expired),
      )
    }

    const portal = await call('POST', '/billing_portal/sessions', {
      customer: customerId,
      return_url: `${site}/settings/billing`,
    })
    record(
      'Customer portal: create session',
      portal.status === 200,
      portal.status === 200 ? '' : why(portal),
    )

    const subs = await call('GET', '/subscriptions', {
      customer: customerId,
      status: 'all',
      limit: '1',
    })
    record('Subscriptions: list', subs.status === 200, subs.status === 200 ? '' : why(subs))

    const invoices = await call('GET', '/invoices', {
      customer: customerId,
      status: 'open',
      limit: '1',
    })
    record('Invoices: list', invoices.status === 200, invoices.status === 200 ? '' : why(invoices))
  }

  await permitted('Subscriptions: retrieve', 'GET', '/subscriptions/sub_atturelkeycheck')
  await permitted('Subscriptions: cancel', 'DELETE', '/subscriptions/sub_atturelkeycheck')
  await permitted('Invoices: void', 'POST', '/invoices/in_atturelkeycheck/void')

  // Informational: a restricted key should NOT reach things Atturel never uses.
  const charges = await call('GET', '/charges', { limit: '1' })
  console.log(
    `INFO  Charges: ${charges.status === 403 ? 'blocked (good: not needed)' : `${charges.status ? `reachable (HTTP ${charges.status}); not needed by Atturel` : 'not checked (network error)'}`}`,
  )
} finally {
  if (customerId) {
    const del = await call('DELETE', `/customers/${customerId}`)
    record(
      'Cleanup: delete the throwaway customer',
      del.status === 200,
      del.status === 200 ? '' : why(del),
    )
  }
}

const failed = results.filter((r) => !r.ok)
console.log(failed.length ? `\n${failed.length} check(s) failed.` : '\nAll checks passed.')
process.exit(failed.length ? 1 : 0)
