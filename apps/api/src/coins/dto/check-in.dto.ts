import { ApiProperty } from "@nestjs/swagger";
import { IsIn } from "class-validator";

export const TASK_TYPES = ["study_10", "study_30", "review_done", "sss_once"] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export class CheckInDto {
  @ApiProperty({ enum: TASK_TYPES })
  @IsIn(TASK_TYPES)
  taskType: TaskType;
}
