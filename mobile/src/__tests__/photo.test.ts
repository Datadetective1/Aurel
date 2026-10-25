jest.mock('expo-image-picker', () => ({
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
  launchImageLibraryAsync: jest.fn(),
}))
jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: 'jpeg' },
}))
jest.mock('expo-file-system', () => ({ File: class {} }))

import * as ImagePicker from 'expo-image-picker'
import { fitWithin, pickPhoto, PHOTO_MAX_SIDE } from '../lib/photo'

describe('a chosen photo, made small on the phone', () => {
  it('brings the longest side down to the limit and keeps the shape', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: PHOTO_MAX_SIDE })
    expect(fitWithin(3024, 4032)).toEqual({ height: PHOTO_MAX_SIDE })
    expect(fitWithin(3000, 3000)).toEqual({ width: PHOTO_MAX_SIDE })
  })

  it('leaves a small photo as it is', () => {
    expect(fitWithin(800, 600)).toBeNull()
    expect(fitWithin(1024, 1024)).toBeNull()
  })

  it('does not guess when the picker gave no size', () => {
    expect(fitWithin(0, 0)).toBeNull()
  })

  it('opens the system picker for images only, and nothing is chosen when it is closed', async () => {
    const launch = ImagePicker.launchImageLibraryAsync as jest.Mock
    launch.mockResolvedValueOnce({ canceled: true, assets: null })
    await expect(pickPhoto()).resolves.toBeNull()
    expect(launch).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaTypes: ['images'],
        allowsEditing: false,
        allowsMultipleSelection: false,
      }),
    )
  })
})
