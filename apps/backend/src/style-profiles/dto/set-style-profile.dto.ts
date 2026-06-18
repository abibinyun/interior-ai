import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SetStyleProfileDto {
  @IsString()
  styleKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  styleNotes?: string;
}
