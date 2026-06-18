import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SessionGuard } from '../sessions/session.guard';
import { AddReferenceDto } from './dto/add-reference.dto';
import {
  ReferencesService,
  SerializedReference,
  UploadedFile as MulterUploadedFile,
} from './references.service';

@Controller()
@UseGuards(SessionGuard)
export class ReferencesController {
  constructor(private readonly service: ReferencesService) {}

  @Get('rooms/:roomId/references')
  async listByRoom(
    @Param('roomId', new ParseUUIDPipe()) roomId: string,
  ): Promise<{ items: SerializedReference[] }> {
    const items = await this.service.listByRoomId(roomId);
    return { items };
  }

  @Post('rooms/:roomId/references')
  @HttpCode(HttpStatus.CREATED)
  async add(
    @Param('roomId', new ParseUUIDPipe()) roomId: string,
    @Body() dto: AddReferenceDto,
  ): Promise<SerializedReference> {
    return this.service.addReference(roomId, dto);
  }

  @Post('rooms/:roomId/references/upload')
  @HttpCode(HttpStatus.CREATED)
  // No fileFilter / limits here — the service enforces MIME + size with a
  // proper UploadRejectedError. Multer itself rejects oversized uploads with
  // an internal exception that escapes the AllExceptionsFilter, so we set the
  // limit comfortably high and rely on the service for the real check.
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async upload(
    @Param('roomId', new ParseUUIDPipe()) roomId: string,
    @UploadedFile() file: MulterUploadedFile,
    @Body('caption') caption?: string,
  ): Promise<SerializedReference> {
    return this.service.uploadReference(roomId, file, caption);
  }

  @Delete('references/:referenceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('referenceId', new ParseUUIDPipe()) referenceId: string,
  ): Promise<void> {
    await this.service.delete(referenceId);
  }
}
