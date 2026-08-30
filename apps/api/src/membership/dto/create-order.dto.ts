import { IsString } from "class-validator";

export class CreateOrderDto {
  @IsString()
  planId: string; // monthly | quarterly | yearly
}
