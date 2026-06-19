import { IsObject, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SanitizeFreeText } from '../../common/sanitize';

function applySanitize(): PropertyDecorator {
  return (target: object, propertyKey: string | symbol): void => {
    SanitizeFreeText()(target, propertyKey);
  };
}

export class BriefOverrideDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @applySanitize()
  purpose?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @applySanitize()
  occupants?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @applySanitize()
  lightingPreferences?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @applySanitize()
  furnitureRequirements?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @applySanitize()
  constraints?: string;
}

export class RefinementsDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @applySanitize()
  colors?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @applySanitize()
  objects?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @applySanitize()
  furniture?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @applySanitize()
  materials?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @applySanitize()
  lighting?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @applySanitize()
  layout?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @applySanitize()
  styleEmphasis?: string;
}

export class StartBatchDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => BriefOverrideDto)
  briefOverride?: BriefOverrideDto;

  @IsOptional()
  @IsUUID()
  parentGenerationId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RefinementsDto)
  refinements?: RefinementsDto;

  @IsOptional()
  @IsObject()
  options?: Record<string, unknown>;
}
