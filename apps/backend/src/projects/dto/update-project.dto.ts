import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { SanitizeFreeText } from '../../common/sanitize';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @SanitizeFreeText()
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @SanitizeFreeText()
  description?: string;
}
