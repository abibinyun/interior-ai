import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateBriefDto {
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
