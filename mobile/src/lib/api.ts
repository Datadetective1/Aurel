import * as React from 'react'
import { File } from 'expo-file-system'
import { config } from './config'
import { supabase } from './supabase'
import { previewResponse } from './preview-data'
import type { DeleteAccountResponse, SignUpRequest, SignUpResponse } from '@atturel/web/lib/mobile/contracts'
import type { SegmentedDeps, SegmentUploadTicket } from './segmented'
import type { PartTranscriber } from './pending-capture'
import { directTranscriber as uploadPart } from './direct-upload'

/**
 * THE APP'S ONE DOOR TO THE BACKEND
 * =============================================================================
 * Every read and write goes through Atturel's own routes with the signed-in
 * user's access token. The shapes are the web's contract
 * (`src/lib/mobile/contracts.ts`), imported rather than redeclared.
 *
 * Failures are typed so screens can say the right thing: offline is not the
 * same as signed out, and neither is the same as "that meeting is gone".
 * =============================================================================
 */

export type ApiFailure =
  | { kind: 'offline' }
  | { kind: 'unauthenticated' }
  | { kind: 'onboarding_required' }
  | { kind: 'not_found' }
  | { kind: 'plan_required'; message: string }
  /** 409: the server's answer is a question (a possible duplicate, a person not yet removed). */
  | { kind: 'conflict'; message: string; body: unknown }
  | { kind: 'server'; message: string }

export class ApiError extends Error {
  constructor(public failure: ApiFailure) {
    super(failure.kind === 'server' ? failure.message : failure.kind)
  }
}

async function token(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (config.previewData) return previewResponse<T>(path, init)

  const access = await token()
  if (!access) throw new ApiError({ kind: 'unauthenticated' })

  let response: Response
  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
        Authorization: `Bearer ${access}`,
      },
    })
  } catch {
    throw new ApiError({ kind: 'offline' })
  }

  const body = (await response.json().catch(() => null)) as { error?: string; code?: string } | null
  if (response.status === 401) throw new ApiError({ kind: 'unauthenticated' })
  if (response.status === 403 && body?.error === 'onboarding_required') {
    throw new ApiError({ kind: 'onboarding_required' })
  }
  if (response.status === 403 && body?.code === 'plan_required') {
    throw new ApiError({ kind: 'plan_required', message: body.error ?? 'This is part of Pro.' })
  }
  if (response.status === 404) throw new ApiError({ kind: 'not_found' })
  if (response.status === 409) {
    throw new ApiError({ kind: 'conflict', message: body?.error ?? 'That clashes with what is already there.', body })
  }
  if (!response.ok) {
    throw new ApiError({ kind: 'server', message: body?.error ?? 'Something went wrong.' })
  }
  return body as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),

  /**
   * Delete the account. Returns the server's answer as data, including the
   * refusals the screen must explain (billing could not be stopped; an Apple
   * subscription needs cancelling first) rather than throwing them away.
   */
  async deleteAccount(body: { confirmation: string; appleAcknowledged?: boolean }): Promise<DeleteAccountResponse> {
    if (config.previewData) {
      return { deleted: false, stage: 'confirmation', error: 'Preview data cannot be deleted.' }
    }
    const access = await token()
    if (!access) throw new ApiError({ kind: 'unauthenticated' })
    let response: Response
    try {
      response = await fetch(`${config.apiUrl}/api/mobile/account`, {
        method: 'DELETE',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
        body: JSON.stringify(body),
      })
    } catch {
      throw new ApiError({ kind: 'offline' })
    }
    if (response.status === 401) throw new ApiError({ kind: 'unauthenticated' })
    const result = (await response.json().catch(() => null)) as DeleteAccountResponse | null
    return result ?? { deleted: false, stage: 'data', error: 'Something went wrong. Nothing was deleted.' }
  },
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),

  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),

  /** A DELETE that carries a confirmation in its body. */
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),

  /** Multipart: the photo routes take one file field, sent as the phone's own file. */
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),

  /**
   * Create an account. The one call made without a session, so it cannot go
   * through `request`. The server answers as the web form does -- the same
   * words whether or not the address already has an account.
   */
  async signUp(body: SignUpRequest): Promise<SignUpResponse> {
    if (config.previewData) return { ok: true, needsConfirmation: true }
    let response: Response
    try {
      response = await fetch(`${config.apiUrl}/api/mobile/sign-up`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      throw new ApiError({ kind: 'offline' })
    }
    const result = (await response.json().catch(() => null)) as SignUpResponse | null
    if (response.status === 404) {
      return { ok: false, error: 'Creating an account from the app is not available yet. Use atturel.com.' }
    }
    return result ?? { ok: false, error: 'Something went wrong. Try again.' }
  },
}

/**
 * One recorded part as the body of one request to the single-upload route,
 * which transcribes it and drops the audio. The rules -- how the file is
 * attached, how a failure is told apart -- are in lib/direct-upload; this
 * gives them the phone: the session's token, the file on disk, and fetch.
 */
export function directTranscriber(participantIds: string[] = []): PartTranscriber {
  if (config.previewData) {
    return async () => {
      const r = await previewResponse<{ text: string }>('/transcribe', {})
      return { ok: true, text: r.text }
    }
  }
  return uploadPart(
    {
      apiUrl: config.apiUrl,
      token,
      openFile: (uri) => new File(uri) as unknown as Blob,
      fetch: (url, init) => fetch(url, init),
    },
    participantIds,
  )
}

/** The private bucket segments are uploaded to (migration 0022). */
const CAPTURE_BUCKET = 'capture-audio'

/**
 * Segmented capture over the real endpoints. Each upload goes to a signed
 * URL for a path the server chose, under the user's own folder; the app
 * never names a path itself.
 */
export function segmentedDeps(): SegmentedDeps {
  const authed = async (path: string, init: RequestInit) => {
    const access = await token()
    if (!access) throw new ApiError({ kind: 'unauthenticated' })
    try {
      return await fetch(`${config.apiUrl}${path}`, {
        ...init,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
      })
    } catch {
      throw new ApiError({ kind: 'offline' })
    }
  }

  return {
    requestUpload: (input) =>
      request<SegmentUploadTicket>('/api/capture/segments', { method: 'POST', body: JSON.stringify(input) }),

    async readFile(uri) {
      // From disk, not through fetch: Expo's fetch answers a missing file
      // with a 404 body, which would be uploaded as if it were the audio.
      return new File(uri).arrayBuffer()
    },

    async putObject(ticket, body) {
      const { error } = await supabase.storage
        .from(CAPTURE_BUCKET)
        .uploadToSignedUrl(ticket.path, ticket.token, body, { contentType: ticket.contentType, upsert: false })
      if (error) throw new Error('That part of the recording could not be uploaded.')
    },

    async transcribe(uploadId) {
      const response = await authed(`/api/capture/segments/${uploadId}/transcribe`, { method: 'POST' })
      const body = (await response.json().catch(() => null)) as
        | { text?: string; error?: string; retryable?: boolean }
        | null
      if (response.ok && typeof body?.text === 'string') return { ok: true, text: body.text }
      return {
        ok: false,
        error: body?.error ?? 'That part of the recording could not be transcribed.',
        retryable: Boolean(body?.retryable),
      }
    },

    async discard(captureId) {
      await authed(`/api/capture/${captureId}`, { method: 'DELETE' })
    },
  }
}

/**
 * A small fetch-on-mount hook with pull-to-refresh, typed by the contract.
 *
 * What a screen has loaded stays on it when a later refresh fails: `error` is
 * only for a screen with nothing to show, and a failed refresh of a loaded
 * screen comes back as `stale`, for a quiet note. Everything is keyed to the
 * path, so one person's record never shows, even for a frame, on another's
 * screen, and an answer that arrives after the path changed is dropped.
 */
export function useApi<T>(path: string | null) {
  const [result, setResult] = React.useState<{ path: string; data: T } | null>(null)
  const [failure, setFailure] = React.useState<{ path: string; failure: ApiFailure } | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)
  const current = React.useRef(path)

  React.useEffect(() => {
    current.current = path
  }, [path])

  const load = React.useCallback(
    async (mode: 'initial' | 'refresh' | 'silent') => {
      if (!path) return
      if (mode === 'refresh') setRefreshing(true)
      try {
        const data = await api.get<T>(path)
        if (current.current !== path) return
        setResult({ path, data })
        setFailure(null)
      } catch (e) {
        if (current.current !== path) return
        setFailure({ path, failure: e instanceof ApiError ? e.failure : { kind: 'server', message: 'Something went wrong.' } })
      } finally {
        setRefreshing(false)
      }
    },
    [path],
  )

  React.useEffect(() => {
    void load('initial')
  }, [load])

  const data = path && result?.path === path ? result.data : null
  const failed = path && failure?.path === path ? failure.failure : null

  return {
    data,
    /** Nothing to show, and why. */
    error: data ? null : failed,
    /** Something is shown, but the latest refresh of it failed. */
    stale: data ? failed : null,
    loading: Boolean(path) && !data && !failed,
    refreshing,
    refresh: () => load('refresh'),
    /** Fetch again without the pull-to-refresh spinner: on returning to a screen. */
    reload: () => load('silent'),
  }
}
