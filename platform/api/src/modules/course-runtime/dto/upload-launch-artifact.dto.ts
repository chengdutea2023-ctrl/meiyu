import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBase64, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadLaunchArtifactDto {
  @ApiProperty({ example: 'launch-token' })
  @IsString()
  launchToken!: string;

  @ApiProperty({ example: 'student-drawing.png' })
  @IsString()
  @MaxLength(180)
  fileName!: string;

  @ApiProperty({ example: 'image/png' })
  @IsString()
  @MaxLength(120)
  mimeType!: string;

  @ApiProperty({ example: 'drawing' })
  @IsString()
  @MaxLength(40)
  kind!: string;

  @ApiProperty({ example: 'base64-encoded-content' })
  @IsString()
  @IsBase64()
  contentBase64!: string;

  @ApiPropertyOptional({ example: { scene: 'final-submit' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
