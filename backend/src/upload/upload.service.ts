import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export type CloudinaryResourceType = 'image' | 'video' | 'raw' | 'auto';

export interface CloudinarySignature {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  resourceType: CloudinaryResourceType;
  uploadUrl: string;
}

const ALLOWED_FOLDERS = new Set([
  'avatars',
  'group-avatars',
  'messages/images',
  'messages/files',
  'messages/voice',
]);

@Injectable()
export class UploadService {
  constructor(private readonly config: ConfigService) {}

  signUpload(
    folder: string,
    resourceType: CloudinaryResourceType = 'auto',
  ): CloudinarySignature {
    if (!ALLOWED_FOLDERS.has(folder))
      throw new BadRequestException(`Folder not allowed: ${folder}`);

    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret)
      throw new BadRequestException(
        'Cloudinary is not configured on the server',
      );

    const timestamp = Math.floor(Date.now() / 1000);

    // Cloudinary signed-upload signature:
    // sha1("<param1>=<value1>&<param2>=<value2>...<api_secret>")
    // params: alphabetical, exclude file/cloud_name/resource_type/api_key
    const paramsToSign: Record<string, string | number> = {
      folder,
      timestamp,
    };
    const sortedKeys = Object.keys(paramsToSign).sort();
    const toSign =
      sortedKeys.map((k) => `${k}=${paramsToSign[k]}`).join('&') + apiSecret;
    const signature = crypto.createHash('sha1').update(toSign).digest('hex');

    return {
      signature,
      timestamp,
      apiKey,
      cloudName,
      folder,
      resourceType,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
    };
  }
}
