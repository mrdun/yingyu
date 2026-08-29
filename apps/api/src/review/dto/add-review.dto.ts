import { IsNotEmpty } from "class-validator";

export class AddReviewDto {
  @IsNotEmpty()
  statementId: string;
}
