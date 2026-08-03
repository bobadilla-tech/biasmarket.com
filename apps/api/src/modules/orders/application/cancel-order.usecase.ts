import {
    BadRequestException,
    Injectable,
} from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service.js";
import { OrderRepository } from "../infrastructure/order.repository.js";
import { CancelOrderDto } from "../dto/cancel-order.dto.js";

@Injectable()
export class CancelOrderUseCase {
    constructor(
        private prisma: PrismaService,
        private orders: OrderRepository,
    ) { }

    async execute(
        orderId: string,
        storeId: string,
        userId: string,
        dto: CancelOrderDto,
    ) {
        console.log("CANCEL DTO =>", dto);

        await this.orders.assertOwnership(storeId, userId);

        const row = await this.orders.findRowByIdForStore(
            orderId,
            storeId,
        );

        if (row.status === "CANCELLED") {
            throw new BadRequestException(
                "Order is already cancelled",
            );
        }

        if (row.fulfillmentStatus === "COMPLETED") {
            throw new BadRequestException(
                "Completed orders cannot be cancelled",
            );
        }

        await this.orders.saveStatus(orderId, {
            status: "CANCELLED",
            cancellationResolution: dto.resolution,
            cancellationReason: dto.reason ?? null,
            cancelledAt: new Date(),
        });

        return this.orders.findRowByIdForStore(orderId, storeId);
    }
}