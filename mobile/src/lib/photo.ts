import * as ImagePicker from 'expo-image-picker'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { File } from 'expo-file-system'

/**
 * PHOTOS
 * =============================================================================
 * A photo the user chooses, for someone in their relationships or for
 * themselves. It comes through the system photo picker, which runs outside
 * the app: Atturel sees only the photo picked, never the library, and never
 * asks for photo-library or camera access (owner's decision D3, 25 Oct 2026).
 *
 * It is made small on the phone before it is sent: the longest side at most
 * 1024 points, as a JPEG. That keeps it well inside the server's 2 MB limit
 * whatever the camera took, and the server checks the type and size again.
 * =============================================================================
 */

export const PHOTO_MAX_SIDE = 1024

/** The resize that keeps the longest side within the limit, or none. */
export function fitWithin(
  width: number,
  height: number,
  max = PHOTO_MAX_SIDE,
): { width: number } | { height: number } | null {
  if (!width || !height || Math.max(width, height) <= max) return null
  return width >= height ? { width: max } : { height: max }
}

/** Open the system picker; the chosen photo, made small, or null if none was chosen. */
export async function pickPhoto(): Promise<string | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    allowsMultipleSelection: false,
    exif: false,
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  })
  if (picked.canceled || !picked.assets?.[0]) return null
  const asset = picked.assets[0]

  const context = ImageManipulator.manipulate(asset.uri)
  const resize = fitWithin(asset.width, asset.height)
  if (resize) context.resize(resize)
  const image = await context.renderAsync()
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 })
  return saved.uri
}

/**
 * The upload body: one `photo` field holding the file itself. Expo's fetch
 * sends a file-system File as its bytes, typed from its extension
 * (image/jpeg), which is what the photo routes check.
 */
export function photoForm(uri: string): FormData {
  const form = new FormData()
  form.append('photo', new File(uri) as unknown as Blob)
  return form
}
