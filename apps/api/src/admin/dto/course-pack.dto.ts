import { IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";

export class CreateCoursePackDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  cover?: string;

  @IsOptional()
  @IsIn(["free", "membership"])
  accessLevel?: "free" | "membership";
}

export class UpdateCoursePackDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  cover?: string;

  // 排序: 与课程/语句的 order 同一套校验 (非负整数), 详情页「编辑课程包」可写
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsIn(["free", "membership"])
  accessLevel?: "free" | "membership";
}

export class SetAccessLevelDto {
  @IsIn(["free", "membership"])
  accessLevel: "free" | "membership";
}
