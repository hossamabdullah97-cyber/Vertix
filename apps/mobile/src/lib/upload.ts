import * as ImagePicker from 'expo-image-picker';
import { api } from './api';

export type ImageSource = 'camera' | 'library';

/**
 * A photo the person picks (or takes), cropped to the shape it goes in, then
 * uploaded as the website does (POST /uploads). Null when they changed their
 * mind or refused access; the upload's own refusal is thrown.
 */
export async function pickAndUpload(source: ImageSource, aspect: [number, number]): Promise<string | null> {
  const ask = source === 'camera' ? ImagePicker.requestCameraPermissionsAsync : ImagePicker.requestMediaLibraryPermissionsAsync;
  if (!(await ask()).granted) return null;
  // Edited and below full quality, so iOS hands over a JPEG rather than HEIC (which the server does not take).
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect, quality: 0.8 };
  const picked = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return null;
  const type = asset.mimeType ?? 'image/jpeg';
  const name = asset.fileName ?? `photo.${type === 'image/png' ? 'png' : 'jpg'}`;
  const form = new FormData();
  // React Native's FormData takes a file as its address on the phone.
  form.append('file', { uri: asset.uri, name, type } as unknown as Blob);
  const { url } = await api<{ url: string }>('/uploads', { method: 'POST', body: form });
  return url;
}
