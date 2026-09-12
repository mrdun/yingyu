import { IsOptional, IsString } from "class-validator";

export class CreateOrderDto {
  @IsString()
  planId: string; // monthly | quarterly | yearly | lifetime

  /** 支付方式: wechat_native | wechat_jsapi | alipay_qr | mock (缺省取第一个可用方式) */
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
