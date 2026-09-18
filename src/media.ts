/** Camera / gallery picker for job photos. */
import { Alert } from 'react-native'
import { launchCamera, launchImageLibrary, type Asset } from 'react-native-image-picker'

export type PickedPhoto = {
  uri: string
  name: string
  type: string
}

function assetToPhoto(asset?: Asset | null): PickedPhoto | null {
  if (!asset?.uri) return null
  const name = asset.fileName || `foto-${Date.now()}.jpg`
  const type = asset.type || 'image/jpeg'
  return { uri: asset.uri, name, type }
}

export function pickJobPhoto(): Promise<PickedPhoto | null> {
  return new Promise(resolve => {
    Alert.alert('Foto', 'Quelle wählen', [
      {
        text: 'Kamera',
        onPress: () => {
          void launchCamera(
            {
              mediaType: 'photo',
              cameraType: 'back',
              quality: 0.7,
              maxWidth: 1600,
              maxHeight: 1600,
              saveToPhotos: false,
            },
            res => {
              if (res.didCancel || res.errorCode) {
                resolve(null)
                return
              }
              resolve(assetToPhoto(res.assets?.[0]))
            },
          )
        },
      },
      {
        text: 'Galerie',
        onPress: () => {
          void launchImageLibrary(
            {
              mediaType: 'photo',
              quality: 0.7,
              maxWidth: 1600,
              maxHeight: 1600,
              selectionLimit: 1,
            },
            res => {
              if (res.didCancel || res.errorCode) {
                resolve(null)
                return
              }
              resolve(assetToPhoto(res.assets?.[0]))
            },
          )
        },
      },
      { text: 'Abbrechen', style: 'cancel', onPress: () => resolve(null) },
    ], { cancelable: true })
  })
}

export function photoFormData(photo: PickedPhoto, kind: 'before' | 'after' | 'other' = 'other') {
  const form = new FormData()
  form.append('kind', kind)
  form.append('photo', {
    uri: photo.uri,
    name: photo.name,
    type: photo.type,
  } as unknown as Blob)
  return form
}
