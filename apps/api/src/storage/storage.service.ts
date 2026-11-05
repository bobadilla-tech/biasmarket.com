import { Injectable } from "@nestjs/common";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { requiredEnv } from "../config/env.validation.js";

@Injectable()
export class StorageService {
  private readonly bucket = requiredEnv("S3_BUCKET");
  private readonly logoBucket = requiredEnv("S3_LOGO_BUCKET");
  // Kept private (no anonymous-read policy — see infra/docker/docker-compose*
  // minio-init) — the authenticated streaming endpoint in order.controller.ts
  // is the only intended way to read a payment image.
  private readonly paymentBucket = requiredEnv("S3_PAYMENT_BUCKET");
  private readonly publicUrl = requiredEnv("S3_PUBLIC_URL").replace(/\/+$/, "");
  private readonly trustedPublicUrls = [
    this.publicUrl,
    ...(process.env.S3_LEGACY_PUBLIC_URLS?.split(",") ?? [])
      .map((value) => value.trim().replace(/\/+$/, ""))
      .filter(Boolean),
  ]
    .map((value) => new URL(value))
    .sort((left, right) => right.pathname.length - left.pathname.length);

  private client = new S3Client({
    region: "us-east-1",
    endpoint: requiredEnv("S3_ENDPOINT"),
    forcePathStyle: true, // requerido por MinIO
    credentials: {
      accessKeyId: requiredEnv("S3_ACCESS_KEY"),
      secretAccessKey: requiredEnv("S3_SECRET_KEY"),
    },
  });

  async uploadImage(buffer: Buffer, mimeType: string): Promise<string> {
    return this.upload(this.bucket, "products", buffer, mimeType);
  }

  async uploadLogo(buffer: Buffer, mimeType: string): Promise<string> {
    return this.upload(this.logoBucket, "logos", buffer, mimeType);
  }

  async uploadStoreBanner(buffer: Buffer, mimeType: string): Promise<string> {
    return this.upload(this.bucket, "store-banners", buffer, mimeType);
  }

  async uploadStoreOwnerAvatar(
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    return this.upload(this.bucket, "store-owner-avatars", buffer, mimeType);
  }

  // Inline images embedded in a seller's `Store.aboutMarkdown` copy. Same
  // public `bucket` as product images (the storefront renders them straight
  // from the CDN host), just a distinct `store-content/` key prefix.
  async uploadStoreContentImage(
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    return this.upload(this.bucket, "store-content", buffer, mimeType);
  }

  async uploadStoreCategoryImage(
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    return this.upload(this.bucket, "store-categories", buffer, mimeType);
  }

  async uploadStoreReferenceImage(
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    return this.upload(this.bucket, "store-references", buffer, mimeType);
  }

  async uploadPaymentImage(buffer: Buffer, mimeType: string): Promise<string> {
    return this.upload(this.paymentBucket, "payments", buffer, mimeType);
  }

  // Yape/Plin QR codes are meant to be shown to any buyer at checkout, so
  // these live in the public `bucket` (same as product images), not the
  // private `paymentBucket` used for buyer-submitted proof-of-payment
  // screenshots — don't conflate the two.
  async uploadPaymentQrImage(
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    return this.upload(this.bucket, "payment-qr", buffer, mimeType);
  }

  // Inverse of `upload`'s `${publicUrl}/${bucket}/${key}` URL shape.
  async deleteImage(url: string): Promise<void> {
    await this.deleteUploadedObject(url);
  }

  async deleteStoreReferenceImage(url: string): Promise<void> {
    await this.deleteUploadedObject(url, "store-references");
  }

  async listPaymentProofObjectsBefore(
    cutoff: Date,
  ): Promise<Array<{ bucket: string; key: string }>> {
    const objects: Array<{ bucket: string; key: string }> = [];
    // `bucket/payments/` contains uploads created before payment proofs were
    // moved into their private bucket. Both locations must be swept, while
    // the URL read path remains compatible with those older rows.
    for (const bucket of new Set([this.paymentBucket, this.bucket])) {
      let continuationToken: string | undefined;
      do {
        const page = await this.client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: "payments/",
            ContinuationToken: continuationToken,
          }),
        );
        for (const object of page.Contents ?? []) {
          if (
            !object.Key ||
            !object.LastModified ||
            object.LastModified >= cutoff
          ) {
            continue;
          }
          objects.push({ bucket, key: object.Key });
        }
        continuationToken = page.IsTruncated
          ? page.NextContinuationToken
          : undefined;
      } while (continuationToken);
    }
    return objects;
  }

  async deletePaymentProofObject(bucket: string, key: string): Promise<void> {
    if (bucket !== this.paymentBucket && bucket !== this.bucket) {
      throw new Error("Invalid payment proof bucket");
    }
    if (!/^payments\/[a-f0-9-]+\.(png|jpg|pdf)$/i.test(key)) {
      throw new Error("Invalid payment proof object key");
    }
    await this.client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    );
  }

  private async deleteUploadedObject(
    url: string,
    expectedPrefix?: string,
  ): Promise<void> {
    let imageUrl: URL;
    try {
      imageUrl = new URL(url);
    } catch {
      throw new Error("Image URL is outside the configured storage origin");
    }
    const matchedBase = this.trustedPublicUrls.find((base) => {
      const objectPathPrefix = `${base.pathname.replace(/\/+$/, "")}/`;
      return (
        imageUrl.origin === base.origin &&
        imageUrl.pathname.startsWith(objectPathPrefix)
      );
    });
    if (!matchedBase || imageUrl.search || imageUrl.hash) {
      throw new Error("Image URL is outside the configured storage origin");
    }
    const objectPathPrefix = `${matchedBase.pathname.replace(/\/+$/, "")}/`;

    let objectPath: string;
    try {
      objectPath = decodeURIComponent(
        imageUrl.pathname.slice(objectPathPrefix.length),
      ).replace(/^\/+/, "");
    } catch {
      throw new Error("Image URL contains an invalid object path");
    }

    const [bucket, ...keyParts] = objectPath.split("/");
    const allowedPrefixes = new Map<string, Set<string>>();
    const addAllowedPrefixes = (bucketName: string, prefixes: string[]) => {
      const existing = allowedPrefixes.get(bucketName) ?? new Set<string>();
      prefixes.forEach((prefix) => existing.add(prefix));
      allowedPrefixes.set(bucketName, existing);
    };
    addAllowedPrefixes(this.bucket, [
      "products",
      "store-banners",
      "store-owner-avatars",
      "store-content",
      "store-categories",
      "store-references",
      "payment-qr",
    ]);
    addAllowedPrefixes(this.logoBucket, ["logos"]);
    addAllowedPrefixes(this.paymentBucket, ["payments"]);
    const prefix = keyParts[0];
    if (
      !bucket ||
      !prefix ||
      !keyParts[1] ||
      keyParts.some((part) => !part || part === "." || part === "..") ||
      (expectedPrefix !== undefined && prefix !== expectedPrefix) ||
      !allowedPrefixes.get(bucket)?.has(prefix)
    ) {
      throw new Error("Image URL is outside an allowed storage prefix");
    }
    const key = keyParts.join("/");

    await this.client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    );
  }

  // Streams a payment image for the authenticated GET endpoint in
  // order.controller.ts — never redirects to a presigned URL (see
  // .artifacts/2026/08/20260808--payment-proof-image-access-control/plan.md's
  // feasibility analysis: S3_ENDPOINT is the internal `minio:9000` Docker
  // hostname in prod, so a presigned URL signed against the existing client
  // would point somewhere the browser can't reach). Parses bucket + key from
  // the stored URL rather than assuming `this.paymentBucket` so images
  // uploaded before the bucket split still resolve.
  async getPaymentImageStream(
    url: string,
  ): Promise<{ body: Readable; contentType: string }> {
    const path = new URL(url).pathname;
    const [, bucket, ...keyParts] = path.split("/");
    const key = keyParts.join("/");

    const result = await this.client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );

    return {
      body: result.Body as Readable,
      contentType: result.ContentType ?? "application/octet-stream",
    };
  }

  private async upload(
    bucket: string,
    prefix: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    const ext =
      mimeType === "image/png"
        ? "png"
        : mimeType === "application/pdf"
          ? "pdf"
          : "jpg";
    const key = `${prefix}/${randomUUID()}.${ext}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );

    return `${this.publicUrl}/${bucket}/${key}`;
  }
}
