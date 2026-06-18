import { IsObject, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BriefOverrideDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  purpose?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  occupants?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  lightingPreferences?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  furnitureRequirements?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  constraints?: string;
}

export class RefinementsDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  colors?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  objects?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  furniture?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  materials?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  lighting?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  layout?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
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
