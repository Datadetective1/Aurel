import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireUser } from '@/lib/auth'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { features } from '@/lib/env'
import { logger } from '@/lib/logger'
import { track } from '@/lib/analytics'
import { getEntitlements } from '@/lib/billing/entitlements'
import { stripe } from '@/lib/billing/stripe'
import { removeAllCaptureAudio } from '@/lib/capture/segments.server'
import { deleteAccountCore, isBillable, type DeletionResult, type StripeOps } from './deletion'

/**
 * Account deletion for the signed-in user, from the web or the app.
 *
 * The same function behind both doors: the web settings form and
 * DELETE /api/mobile/account. See ./deletion for the order of operations.
 */
export async function deleteCurrentAccount(input: {
  via: 'web' | 'ios'
  appleAcknowledged?: boolean
}): Promise<DeletionResult> {
  const user = await requireUser()
  const supabase = await createClient()

  const result = await deleteAccountCore(
    { userId: user.id, via: input.via, appleAcknowledged: input.appleAcknowledged },
    {
      async loadBilling() {
        const entitlements = await getEntitlements()
        // Read with the service role when available: the customer id must be
        // found even if the user-scoped read were ever narrowed.
        const reader = features.serviceRole ? createServiceRoleClient() : supabase
        const { data } = await reader
          .from('subscriptions')
          .select('stripe_customer_id')
          .eq('user_id', user.id)
          .maybeSingle()
        return {
          plan: entitlements.plan,
          tier: entitlements.tier,
          stripeCustomerId: data?.stripe_customer_id ?? null,
          appleActive: entitlements.provider === 'apple',
        }
      },

      stripe: features.billing ? stripeOps() : null,

      audit: {
        async record(row) {
          if (!features.serviceRole) return null
          const admin = createServiceRoleClient() as unknown as SupabaseClient
          const { data, error } = await admin
            .from('account_deletions')
            .insert(row)
            .select('id')
            .single()
          if (error) {
            logger.warn('account.delete_audit_failed', { code: error.code })
            return null
          }
          return (data as { id: string }).id
        },
        async mark(id, field) {
          const admin = createServiceRoleClient() as unknown as SupabaseClient
          await admin
            .from('account_deletions')
            .update({ [field]: new Date().toISOString() })
            .eq('id', id)
        },
      },

      async deleteData() {
        await removePhotos(supabase, user.id)
        if (features.captureStorage) {
          // Any segment still in temporary storage goes with the account.
          await removeAllCaptureAudio(user.id).catch((error) =>
            logger.warn('account.delete_capture_audio_failed', {
              error: error instanceof Error ? error.name : 'unknown',
            }),
          )
        }
        const { error } = await supabase.rpc('delete_my_data')
        if (error) {
          logger.error('account.delete_data_failed', { code: error.code })
          return false
        }
        return true
      },

      async deleteLogin() {
        if (!features.serviceRole) return false
        const { error } = await createServiceRoleClient().auth.admin.deleteUser(user.id)
        if (error) {
          logger.warn('account.delete_auth_failed', { error: error.name })
          return false
        }
        return true
      },

      log: (event, fields) => logger.info(event, fields),
    },
  )

  if (result.ok) await track('account_deleted', { via: input.via })
  return result
}

function stripeOps(): StripeOps {
  return {
    async listBillableSubscriptions(customerId) {
      const list = await stripe().subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 100,
      })
      return list.data
        .filter((s) => isBillable(s.status))
        .map((s) => ({ id: s.id, status: s.status }))
    },
    async cancelSubscription(id) {
      // Immediately, without proration or a final invoice: the account is
      // going away, and nothing further should be charged for it.
      const canceled = await stripe().subscriptions.cancel(
        id,
        { prorate: false, invoice_now: false },
        { idempotencyKey: `account-delete:${id}` },
      )
      return { status: canceled.status }
    },
    async listOpenInvoices(customerId) {
      const list = await stripe().invoices.list({
        customer: customerId,
        status: 'open',
        limit: 100,
      })
      return list.data.filter((i) => Boolean(i.id)).map((i) => ({ id: i.id as string }))
    },
    async voidInvoice(id) {
      await stripe().invoices.voidInvoice(id, {}, { idempotencyKey: `account-delete-void:${id}` })
    },
    async expireOpenCheckouts(customerId) {
      const list = await stripe().checkout.sessions.list({
        customer: customerId,
        status: 'open',
        limit: 100,
      })
      for (const session of list.data) await stripe().checkout.sessions.expire(session.id)
      return list.data.length
    },
  }
}

/**
 * Photos first, through the Storage API: storage.objects refuses direct SQL
 * deletes, so the database function cannot take the folder with it. Best
 * effort -- an orphaned image is a lesser failure than a record that would
 * not delete.
 */
async function removePhotos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<void> {
  try {
    const { AVATAR_BUCKET } = await import('@/lib/conversations/avatars')
    const bucket = supabase.storage.from(AVATAR_BUCKET)
    for (const folder of [`${userId}/people`, userId]) {
      const { data: objects } = await bucket.list(folder, { limit: 1000 })
      const paths = (objects ?? []).filter((o) => o.id).map((o) => `${folder}/${o.name}`)
      if (paths.length > 0) await bucket.remove(paths)
    }
  } catch (error) {
    logger.warn('account.delete_photos_failed', {
      error: error instanceof Error ? error.name : 'unknown',
    })
  }
}
