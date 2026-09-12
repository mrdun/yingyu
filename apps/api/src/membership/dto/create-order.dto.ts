import { IsOptional, IsString } from "class-validator";

export class CreateOrderDto {
  @IsString()
  planId: string; // monthly | quarterly | yearly | lifetime

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
