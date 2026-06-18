import { IsUUID } from 'class-validator';

export class ApproveDto {
  @IsUUID()
  generationId!: string;
}
