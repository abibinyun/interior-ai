import { IsOptional, IsString, MaxLength } from 'class-validator';
import { SanitizeFreeText } from '../../common/sanitize';

export class UpdateBriefDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @SanitizeFreeText()
  purpose?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @SanitizeFreeText()
  occupants?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @SanitizeFreeText()
  lightingPreferences?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @SanitizeFreeText()
  furnitureRequirements?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @SanitizeFreeText()
  constraints?: string;
}
