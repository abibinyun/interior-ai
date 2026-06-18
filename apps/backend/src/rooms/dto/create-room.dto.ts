import { IsEnum } from 'class-validator';
import { RoomType } from '@prisma/client';

export class CreateRoomDto {
  @IsEnum(RoomType)
  roomType!: RoomType;
}
