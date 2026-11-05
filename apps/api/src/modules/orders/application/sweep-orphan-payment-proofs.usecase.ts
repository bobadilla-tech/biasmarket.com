import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service.js";
import { StorageService } from "../../../storage/storage.service.js";

const MIN_ORPHAN_AGE_HOURS = 24;

@Injectable()
export class SweepOrphanPaymentProofsUseCase {
  private readonly logger = new Logger(SweepOrphanPaymentProofsUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async execute() {
    const cutoff = new Date(Date.now() - MIN_ORPHAN_AGE_HOURS * 60 * 60 * 1000);
    const [references, candidates] = await Promise.all([
      this.prisma.orderPayment.findMany({
        where: { imageUrl: { contains: "/payments/" } },
        select: { imageUrl: true },
      }),
      this.storage.listPaymentProofObjectsBefore(cutoff),
    ]);
    const referencedKeys = new Set(
      references.flatMap(({ imageUrl }) => {
        if (!imageUrl) return [];
        try {
          const pathname = decodeURIComponent(new URL(imageUrl).pathname);
          const match = pathname.match(/\/([^/]+)\/(payments\/[^/]+)$/);
          return match ? [`${match[1]}/${match[2]}`] : [];
        } catch {
          return [];
        }
      }),
    );

    let deleted = 0;
    let failed = 0;
    for (const candidate of candidates) {
      if (referencedKeys.has(`${candidate.bucket}/${candidate.key}`)) continue;
      try {
        await this.storage.deletePaymentProofObject(
          candidate.bucket,
          candidate.key,
        );
        deleted++;
      } catch {
        failed++;
        this.logger.warn("Failed to delete an orphaned payment proof object");
      }
    }
    return { deleted, failed };
  }
}
