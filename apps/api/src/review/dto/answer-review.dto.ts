import { Type } from "class-transformer";
import { IsInt, IsNotEmpty, Max, Min } from "class-validator";

export class AnswerReviewDto {
  @IsNotEmpty()
  statementId: string;

  @IsInt()
  @Min(0)
  @Max(5)
  @Type(() => Number)
  quality: number;
}
