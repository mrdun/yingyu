import { IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";

export class CreateCourseDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  video?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  video?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class CreateStatementDto {
  @IsString()
  chinese: string;

  @IsString()
  english: string;

  @IsOptional()
  @IsString()
  soundmark?: string;

  @IsOptional()
  @IsIn(["text", "audio", "video"])
  sourceType?: string;

  @IsOptional()
  @IsString()
  audioUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  startMs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  endMs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdateStatementDto {
  @IsOptional()
  @IsString()
  chinese?: string;

  @IsOptional()
  @IsString()
  english?: string;

  @IsOptional()
  @IsString()
  soundmark?: string;

  @IsOptional()
  @IsIn(["text", "audio", "video"])
  sourceType?: string;

  @IsOptional()
  @IsString()
  audioUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  startMs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  endMs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
