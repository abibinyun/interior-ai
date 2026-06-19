import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { SanitizeFreeText } from '../../common/sanitize';

export class AddReferenceDto {
  @IsString()
  sourceType!: 'GENERATED' | 'UPLOADED' | 'EXTERNAL_URL';

  // Required when sourceType === 'GENERATED'
  @IsOptional()
  @IsString()
  sourceId?: string;

  // Required when sourceType === 'EXTERNAL_URL'
  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false })
  externalUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @SanitizeFreeText()
  caption?: string;
}
