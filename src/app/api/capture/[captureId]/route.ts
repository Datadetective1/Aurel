import { NextResponse } from 'next/server'
import { requireOnboardedUser } from '@/lib/auth'
import { features } from '@/lib/env'
import { discardCapture } from '@/lib/capture/segments'
import { supabaseSegmentDeps } from '@/lib/capture/segments.server'

/** Discard a recording: every segment still in storage is deleted now. */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ captureId: string }> },
) {
  const { user } = await requireOnboardedUser()
  if (!features.captureStorage) return NextResponse.json({ removed: 0 })
  const { captureId } = await params
  const removed = await discardCapture(user.id, captureId, supabaseSegmentDeps())
  return NextResponse.json({ removed }, { headers: { 'cache-control': 'no-store' } })
}
