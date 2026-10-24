import { Platform } from 'react-native'
import { Directory, File, Paths } from 'expo-file-system'
import { config } from './config'
import { memoryStore, type PendingCapture, type PendingStore } from './pending-capture'

/**
 * Where an unsent recording is written down: one JSON file in the app's
 * private Documents folder, beside the audio files expo-audio writes there
 * (VOICE_RECORDING sets `directory: 'document'`). iOS never clears Documents
 * under storage pressure, unlike the cache; like any app document it can be
 * part of the person's own device backup while it exists. Both are deleted
 * the moment the conversation has been kept, or when the person discards it.
 *
 * The web preview has no file system and preview data never records, so it
 * uses memory.
 */

function fileStore(): PendingStore {
  const folder = new Directory(Paths.document, 'atturel-capture')
  const note = new File(folder, 'pending.json')

  const file = (uri: string) => {
    try {
      return new File(uri)
    } catch {
      return null
    }
  }

  return {
    load() {
      try {
        if (!note.exists) return null
        const parsed = JSON.parse(note.textSync()) as PendingCapture
        return Array.isArray(parsed?.parts) ? parsed : null
      } catch {
        return null
      }
    },
    save(pending) {
      if (!folder.exists) folder.create({ intermediates: true, idempotent: true })
      note.write(JSON.stringify(pending))
    },
    clear() {
      try {
        if (note.exists) note.delete()
      } catch {
        // Nothing to clear.
      }
    },
    sizeOf(uri) {
      const f = file(uri)
      try {
        return f && f.exists ? (f.size ?? 0) : null
      } catch {
        return null
      }
    },
    removeAudio(uri) {
      const f = file(uri)
      try {
        if (f && f.exists) f.delete()
      } catch {
        // Already gone.
      }
    },
  }
}

let store: PendingStore | null = null
const previewSizes = new Map<string, number>()
let previewParts = 0

export function pendingStore(): PendingStore {
  if (store) return store
  store = Platform.OS === 'web' || config.previewData ? memoryStore(previewSizes) : fileStore()
  return store
}

/** A stand-in file for the preview's simulated recorder, one per part. */
export function previewPartUri(): string {
  const uri = `preview://part-${++previewParts}.m4a`
  previewSizes.set(uri, 240_000)
  return uri
}
