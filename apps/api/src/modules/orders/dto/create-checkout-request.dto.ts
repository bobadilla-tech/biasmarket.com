import { ApiPropertyOptional, ApiSchema } from "@nestjs/swagger";
import type { Express } from "express";
import { CreateOrderDto } from "./create-order.dto.js";

@ApiSchema({ name: "CreateOrderDto" })
export class CreateCheckoutRequestDto extends CreateOrderDto {
  @ApiPropertyOptional({
    type: "string",
    format: "binary",
    description:
      "Payment proof image. Required for configured non-cash payment methods.",
  })
  file?: Express.Multer.File;
}
