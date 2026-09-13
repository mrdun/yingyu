import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from "class-validator";

/**
 * 学习路线管理端 DTO (O-04 批次)。
 *
 * 校验风格与 apps/api/src/admin/dto/{course-pack,course-content}.dto.ts 保持一致:
 * - title 必填且非空 (@IsString + @IsNotEmpty)
 * - description / cover / stage 可选字符串
 * - order 一律 @IsOptional @IsInt @Min(0) —— 与课程包/课程/语句的排序同一套规则
 *
 * schema 不改: learning_paths / learning_path_items 的字段完全沿用既有定义
 * (见 packages/schema/src/schema/learningPath.ts)。
 */

export class CreateLearningPathDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  cover?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdateLearningPathDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  cover?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

/** PATCH /admin/learning-paths/:id/publish —— 发布 / 下架 (幂等: 重复设置同一值也返回 200) */
export class SetLearningPathPublishedDto {
  @IsBoolean()
  isPublished: boolean;
}

export class CreateLearningPathItemDto {
  @IsString()
  @IsNotEmpty()
  coursePackId: string;

  @IsOptional()
  @IsString()
  stage?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdateLearningPathItemDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  coursePackId?: string;

  @IsOptional()
  @IsString()
  stage?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
