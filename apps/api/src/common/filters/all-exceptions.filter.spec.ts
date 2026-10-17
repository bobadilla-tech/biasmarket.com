import { type ArgumentsHost, BadRequestException } from "@nestjs/common";
import { vi } from "vitest";
import { DuplicateOperationCodeException } from "../../modules/orders/domain/duplicate-operation-code.exception.js";
import { DuplicateIdempotencyKeyException } from "../../modules/orders/domain/duplicate-idempotency-key.exception.js";
import { AllExceptionsFilter } from "./all-exceptions.filter.js";

function run(exception: unknown) {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status, setHeader: vi.fn() }),
      getRequest: () => ({ url: "/api/stores/s/orders/o/payments" }),
    }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return { status, body: json.mock.calls[0]![0] as Record<string, unknown> };
}

describe("AllExceptionsFilter", () => {
  it("answers a duplicate operation code with exactly { code, orderId }", () => {
    const { status, body } = run(
      new DuplicateOperationCodeException("order-9"),
    );
    expect(status).toHaveBeenCalledWith(409);
    expect(Object.keys(body).sort()).toEqual(["code", "orderId"]);
    expect(body).toEqual({
      code: "DUPLICATE_OPERATION_CODE",
      orderId: "order-9",
    });
  });

  it("answers an idempotent replay with 409 and { statusCode, code, orderId, message }", () => {
    const { status, body } = run(
      new DuplicateIdempotencyKeyException("order-7"),
    );
    expect(status).toHaveBeenCalledWith(409);
    expect(Object.keys(body).sort()).toEqual([
      "code",
      "message",
      "orderId",
      "statusCode",
    ]);
    expect(body).toEqual({
      statusCode: 409,
      code: "IDEMPOTENT_REPLAY",
      orderId: "order-7",
      message: "Este pedido ya fue creado con esta clave",
    });
  });

  it("keeps the usual shape for other HTTP exceptions", () => {
    const { status, body } = run(new BadRequestException("Monto inválido"));
    expect(status).toHaveBeenCalledWith(400);
    expect(body).toMatchObject({ statusCode: 400, message: "Monto inválido" });
  });
});
