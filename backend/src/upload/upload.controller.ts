import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  UploadService,
  CloudinaryResourceType,
} from './upload.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('signature')
  signature(
    @Body() body: { folder: string; resourceType?: CloudinaryResourceType },
  ) {
    return this.uploadService.signUpload(body.folder, body.resourceType);
  }
}
