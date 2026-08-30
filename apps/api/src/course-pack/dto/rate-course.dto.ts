import { IsInt, IsNotEmpty, Min } from "class-validator";

export class RateCourseDto {
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  total: number;

  @IsNotEmpty()
  @IsInt()
  @Min(0)
  correct: number;
}
