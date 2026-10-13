import * as React from 'react'
import { config } from './config'
import { supabase } from './supabase'
import { previewResponse } from './preview-data'

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

  const body = (await response.json().catch(() => null)) as { error?: string } | null
  if (response.status === 401) throw new ApiError({ kind: 'unauthenticated' })
  if (response.status === 403 && body?.error === 'onboarding_required') {
    throw new ApiError({ kind: 'onboarding_required' })
  }
  if (response.status === 404) throw new ApiError({ kind: 'not_found' })
  if (!response.ok) {
    throw new ApiError({ kind: 'server', message: body?.error ?? 'Something went wrong.' })
  }
  return body as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),

  /**
   * Audio to words, through the same route the web recorder uses. The audio
   * is uploaded, transcribed and dropped server-side; only text comes back.
   */
  async transcribe(uri: string, durationSeconds: number, participantIds: string[] = []): Promise<string> {
    if (config.previewData) return previewResponse<{ text: string }>('/transcribe', {}).then((r) => r.text)
    const form = new FormData()
    const extension = uri.split('.').pop()?.toLowerCase() ?? 'm4a'
    form.append('audio', { uri, name: `capture.${extension}`, type: extension === 'webm' ? 'audio/webm' : 'audio/mp4' } as unknown as Blob)
    form.append('durationSeconds', String(Math.round(durationSeconds)))
    for (const id of participantIds) form.append('participant', id)
    const result = await request<{ text: string }>('/api/conversations/transcribe', { method: 'POST', body: form })
    return result.text
  },
}

/** A small fetch-on-mount hook with pull-to-refresh, typed by the contract. */
export function useApi<T>(path: string | null) {
  const [data, setData] = React.useState<T | null>(null)
  const [error, setError] = React.useState<ApiFailure | null>(null)
  const [loading, setLoading] = React.useState(Boolean(path))
  const [refreshing, setRefreshing] = React.useState(false)

  const load = React.useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (!path) return
      if (mode === 'refresh') setRefreshing(true)
      try {
        const result = await api.get<T>(path)
        setData(result)
        setError(null)
      } catch (e) {
        setError(e instanceof ApiError ? e.failure : { kind: 'server', message: 'Something went wrong.' })
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [path],
  )

  React.useEffect(() => {
    void load('initial')
  }, [load])

  return { data, error, loading, refreshing, refresh: () => load('refresh') }
}
