import { Injectable } from "@nestjs/common";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

@Injectable()
export class StorageService {
  private readonly bucket = requiredEnv("S3_BUCKET");
  private readonly logoBucket = requiredEnv("S3_LOGO_BUCKET");
  private readonly publicUrl = requiredEnv("S3_PUBLIC_URL");

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

  async uploadPaymentImage(buffer: Buffer, mimeType: string): Promise<string> {
    return this.upload(this.bucket, "payments", buffer, mimeType);
  }

  private async upload(
    bucket: string,
    prefix: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    const ext = mimeType === "image/png" ? "png" : "jpg";
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
