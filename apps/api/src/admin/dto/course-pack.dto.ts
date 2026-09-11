import { IsIn, IsOptional, IsString } from "class-validator";

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

  @IsOptional()
  @IsIn(["free", "membership"])
  accessLevel?: "free" | "membership";
}

export class SetAccessLevelDto {
  @IsIn(["free", "membership"])
  accessLevel: "free" | "membership";
}
