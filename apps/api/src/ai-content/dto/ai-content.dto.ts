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
