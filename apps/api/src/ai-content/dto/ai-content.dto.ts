import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from "class-validator";

export class SplitDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  text: string;
}

export class CoursePackDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsString()
  text: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  courseSize?: number;
}

export class SubtitleDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsString()
  subtitle: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  courseSize?: number;
}

export class AudioDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** base64 编码的音频内容（MVP 用 base64 简化，生产可换 multipart） */
  @IsNotEmpty()
  @IsString()
  audioBase64: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  courseSize?: number;
}
