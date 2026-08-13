import { Injectable } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { requiredEnv } from '../config/env.validation.js';

@Injectable()
export class StorageService {
  private readonly bucket = requiredEnv('S3_BUCKET');
  private readonly logoBucket = requiredEnv('S3_LOGO_BUCKET');
  // Kept private (no anonymous-read policy — see infra/docker/docker-compose*
  // minio-init) — the authenticated streaming endpoint in order.controller.ts
  // is the only intended way to read a payment image.
  private readonly paymentBucket = requiredEnv('S3_PAYMENT_BUCKET');
  private readonly publicUrl = requiredEnv('S3_PUBLIC_URL');

  private client = new S3Client({
    region: 'us-east-1',
    endpoint: requiredEnv('S3_ENDPOINT'),
    forcePathStyle: true, // requerido por MinIO
    credentials: {
      accessKeyId: requiredEnv('S3_ACCESS_KEY'),
      secretAccessKey: requiredEnv('S3_SECRET_KEY'),
    },
  });

  async uploadImage(buffer: Buffer, mimeType: string): Promise<string> {
    return this.upload(this.bucket, 'products', buffer, mimeType);
  }

  async uploadLogo(buffer: Buffer, mimeType: string): Promise<string> {
    return this.upload(this.logoBucket, 'logos', buffer, mimeType);
  }

  async uploadPaymentImage(buffer: Buffer, mimeType: string): Promise<string> {
    return this.upload(this.paymentBucket, 'payments', buffer, mimeType);
  }

  // Yape/Plin QR codes are meant to be shown to any buyer at checkout, so
  // these live in the public `bucket` (same as product images), not the
  // private `paymentBucket` used for buyer-submitted proof-of-payment
  // screenshots — don't conflate the two.
  async uploadPaymentQrImage(
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    return this.upload(this.bucket, 'payment-qr', buffer, mimeType);
  }

  // Inverse of `upload`'s `${publicUrl}/${bucket}/${key}` URL shape.
  async deleteImage(url: string): Promise<void> {
    const key = url.slice(`${this.publicUrl}/${this.bucket}/`.length);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  // Streams a payment image for the authenticated GET endpoint in
  // order.controller.ts — never redirects to a presigned URL (see
  // docs/plans/2026-08-08-payment-proof-image-access-control-plan.md's
  // feasibility analysis: S3_ENDPOINT is the internal `minio:9000` Docker
  // hostname in prod, so a presigned URL signed against the existing client
  // would point somewhere the browser can't reach). Parses bucket + key from
  // the stored URL rather than assuming `this.paymentBucket` so images
  // uploaded before the bucket split still resolve.
  async getPaymentImageStream(
    url: string,
  ): Promise<{ body: Readable; contentType: string }> {
    const path = new URL(url).pathname;
    const [, bucket, ...keyParts] = path.split('/');
    const key = keyParts.join('/');

    const result = await this.client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );

    return {
      body: result.Body as Readable,
      contentType: result.ContentType ?? 'application/octet-stream',
    };
  }

  private async upload(
    bucket: string,
    prefix: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    const ext =
      mimeType === 'image/png'
        ? 'png'
        : mimeType === 'application/pdf'
          ? 'pdf'
          : 'jpg';
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
