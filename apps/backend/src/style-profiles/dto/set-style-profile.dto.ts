import { IsOptional, IsString, MaxLength } from 'class-validator';
import { SanitizeFreeText } from '../../common/sanitize';

export class SetStyleProfileDto {
  @IsString()
  styleKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @SanitizeFreeText()
  styleNotes?: string;
}
