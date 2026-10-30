import * as ImagePicker from 'expo-image-picker'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { parseCardText, type CardFields } from '@atturel/web/lib/people/card-text'
import { fitWithin } from './photo'

/**
 * CARD AND BADGE SCAN
 * =============================================================================
 * A photo of a business card or a conference badge, read on the phone.
 * Text recognition is the system's own (Apple Vision on iPhone): the photo
 * never leaves the device, nothing is uploaded, and no service is paid for.
 *
 * The photo comes through the same system picker as every other photo, so
 * Atturel still never asks for camera or library access (decision D3). The
 * fields it finds are a draft: the user checks each one before anything is
 * saved.
 * =============================================================================
 */

// Loaded defensively: a build without the native module (Expo Go, tests, web)
// says scanning is unavailable rather than failing to open the screen.
let extractor: typeof import('expo-text-extractor') | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  extractor = require('expo-text-extractor') as typeof import('expo-text-extractor')
} catch {
  extractor = null
}

/** Larger than a profile photo: small print on a card needs the pixels. */
const SCAN_MAX_SIDE = 2048

export const scanSupported = Boolean(extractor?.isSupported)

export type ScanResult =
  | { ok: true; fields: CardFields; lines: string[] }
  | { ok: false; reason: 'cancelled' | 'unsupported' | 'nothing_read' | 'failed' }

export async function scanCard(): Promise<ScanResult> {
  if (!extractor || !scanSupported) return { ok: false, reason: 'unsupported' }
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    allowsMultipleSelection: false,
    exif: false,
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  })
  if (picked.canceled || !picked.assets?.[0]) return { ok: false, reason: 'cancelled' }
  const asset = picked.assets[0]
  try {
    const context = ImageManipulator.manipulate(asset.uri)
    const resize = fitWithin(asset.width, asset.height, SCAN_MAX_SIDE)
    if (resize) context.resize(resize)
    const image = await context.renderAsync()
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 })
    const lines = (await extractor.extractTextFromImage(saved.uri)).map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return { ok: false, reason: 'nothing_read' }
    return { ok: true, fields: parseCardText(lines), lines }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}
