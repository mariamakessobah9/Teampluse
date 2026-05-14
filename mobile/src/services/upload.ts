import api from './api';

export type UploadFolder =
  | 'avatars'
  | 'group-avatars'
  | 'messages/images'
  | 'messages/files'
  | 'messages/voice';

export type CloudinaryResourceType = 'image' | 'video' | 'raw' | 'auto';

interface SignaturePayload {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  resourceType: CloudinaryResourceType;
  uploadUrl: string;
}

export interface UploadedAsset {
  url: string;
  publicId: string;
  resourceType: string;
  format: string;
  bytes: number;
  originalFilename?: string;
  duration?: number;
}

export interface UploadInput {
  uri: string;
  name: string;
  mimeType: string;
  folder: UploadFolder;
  resourceType?: CloudinaryResourceType;
  onProgress?: (pct: number) => void;
}

const getSignature = async (
  folder: UploadFolder,
  resourceType: CloudinaryResourceType,
): Promise<SignaturePayload> => {
  const { data } = await api.post('/upload/signature', {
    folder,
    resourceType,
  });
  return data;
};

export const uploadToCloudinary = async (
  input: UploadInput,
): Promise<UploadedAsset> => {
  const resourceType = input.resourceType ?? 'auto';
  const sig = await getSignature(input.folder, resourceType);

  const form = new FormData();
  form.append('file', {
    uri: input.uri,
    name: input.name,
    type: input.mimeType,
  } as unknown as Blob);
  form.append('api_key', sig.apiKey);
  form.append('timestamp', String(sig.timestamp));
  form.append('signature', sig.signature);
  form.append('folder', sig.folder);

  const res = await fetch(sig.uploadUrl, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloudinary upload failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  return {
    url: json.secure_url as string,
    publicId: json.public_id as string,
    resourceType: json.resource_type as string,
    format: json.format as string,
    bytes: json.bytes as number,
    originalFilename: json.original_filename as string | undefined,
    duration: json.duration as number | undefined,
  };
};
