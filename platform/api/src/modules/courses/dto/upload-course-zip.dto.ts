import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UploadCourseZipDto {
  @ApiProperty({ example: 'can-machines-learn.zip' })
  @IsString()
  fileName!: string;

  @ApiProperty({ example: 'UEsDBBQAAAAIA...' })
  @IsString()
  contentBase64!: string;

  @ApiPropertyOptional({
    example: true,
    description: '静态课件校验通过后可直接发布；Node 课件需先部署成功。',
  })
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}
