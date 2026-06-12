import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ImportStudentRowDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  rowNumber?: number;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  ageBand?: string;
}

export class ImportStudentsDto {
  @IsString()
  classId!: string;

  @IsString()
  @MinLength(8)
  defaultPassword!: string;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ImportStudentRowDto)
  students!: ImportStudentRowDto[];
}
