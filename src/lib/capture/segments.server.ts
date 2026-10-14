import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { SegmentDeps, SegmentRow, SegmentStorage, SegmentStore } from './segments'

/**
 * Segmented capture over Supabase: the `audio_uploads` ledger and the private
 * `capture-audio` bucket, both service-role only (migration 0022, untyped
 * until applied -- the same treatment as other not-yet-applied tables).
 */
export const CAPTURE_BUCKET = 'capture-audio'

type Raw = Record<string, unknown>

function toRow(r: Raw): SegmentRow {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    captureId: r.capture_id as string,
    index: r.segment_index as number,
    path: r.storage_path as string,
    extension: r.extension as SegmentRow['extension'],
    declaredBytes: r.declared_bytes as number,
    declaredSeconds: (r.declared_seconds as number | null) ?? null,
    status: r.status as SegmentRow['status'],
    attempts: (r.attempts as number) ?? 0,
    createdAt: r.created_at as string,
    objectDeletedAt: (r.object_deleted_at as string | null) ?? null,
  }
}

const COLUMNS =
  'id, user_id, capture_id, segment_index, storage_path, extension, declared_bytes, declared_seconds, status, attempts, created_at, object_deleted_at'

export function supabaseSegmentDeps(): SegmentDeps {
  const admin = createServiceRoleClient() as unknown as SupabaseClient
  const table = () => admin.from('audio_uploads')
  const bucket = () => admin.storage.from(CAPTURE_BUCKET)

  const store: SegmentStore = {
    async insert(row) {
      const { data, error } = await table()
        .insert({
          user_id: row.userId,
          capture_id: row.captureId,
          segment_index: row.index,
          storage_path: row.path,
          extension: row.extension,
          declared_bytes: row.declaredBytes,
          declared_seconds: row.declaredSeconds,
        })
        .select('id')
        .single()
      if (error?.code === '23505') return { ok: false, reason: 'duplicate' }
      if (error) throw new Error(`audio_upload_insert_failed:${error.code ?? 'unknown'}`)
      return { ok: true, id: (data as { id: string }).id }
    },
    async get(id) {
      const { data } = await table().select(COLUMNS).eq('id', id).maybeSingle()
      return data ? toRow(data as Raw) : null
    },
    async update(id, patch) {
      const values: Raw = {}
      if (patch.status) values.status = patch.status
      if (patch.attempts !== undefined) values.attempts = patch.attempts
      if (patch.errorCode !== undefined) values.error_code = patch.errorCode
      if (patch.measuredSeconds !== undefined) values.measured_seconds = patch.measuredSeconds
      if (patch.transcribedAt) values.transcribed_at = patch.transcribedAt
      if (patch.objectDeletedAt) values.object_deleted_at = patch.objectDeletedAt
      const { error } = await table().update(values).eq('id', id)
      if (error) throw new Error(`audio_upload_update_failed:${error.code ?? 'unknown'}`)
    },
    async listForCapture(userId, captureId) {
      const { data } = await table()
        .select(COLUMNS)
        .eq('user_id', userId)
        .eq('capture_id', captureId)
      return (data ?? []).map((r) => toRow(r as Raw))
    },
    async listOrphans(olderThan, limit) {
      const { data } = await table()
        .select(COLUMNS)
        .is('object_deleted_at', null)
        .lt('created_at', olderThan)
        .limit(limit)
      return (data ?? []).map((r) => toRow(r as Raw))
    },
  }

  const storage: SegmentStorage = {
    async signedUploadUrl(path) {
      const { data, error } = await bucket().createSignedUploadUrl(path)
      if (error || !data) throw new Error('signed_upload_failed')
      return { signedUrl: data.signedUrl, token: data.token }
    },
    async download(path) {
      const { data, error } = await bucket().download(path)
      if (error || !data) return null
      return data
    },
    async remove(paths) {
      if (paths.length === 0) return
      const { error } = await bucket().remove(paths)
      if (error) throw new Error('storage_remove_failed')
    },
  }

  return { store, storage }
}

/**
 * Every capture object under one user's folder, for account deletion. Lists
 * the bucket rather than trusting the ledger, so an object the ledger never
 * recorded is removed too.
 */
export async function removeAllCaptureAudio(userId: string): Promise<number> {
  const admin = createServiceRoleClient() as unknown as SupabaseClient
  const bucket = admin.storage.from(CAPTURE_BUCKET)
  const { data: captures, error } = await bucket.list(userId, { limit: 1000 })
  if (error || !captures) return 0
  let removed = 0
  for (const capture of captures) {
    const folder = `${userId}/${capture.name}`
    const { data: objects } = await bucket.list(folder, { limit: 1000 })
    const paths = (objects ?? []).filter((o) => o.id).map((o) => `${folder}/${o.name}`)
    if (paths.length > 0) {
      await bucket.remove(paths)
      removed += paths.length
    }
  }
  return removed
}
