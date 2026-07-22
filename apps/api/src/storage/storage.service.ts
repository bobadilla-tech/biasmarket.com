import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

function requiredEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required env var: ${name}`);
    return value;
}

@Injectable()
export class StorageService {
    private readonly bucket = requiredEnv('S3_BUCKET');
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
        const ext = mimeType === 'image/png' ? 'png' : 'jpg';
        const key = `products/${randomUUID()}.${ext}`;

        await this.client.send(
            new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                Body: buffer,
                ContentType: mimeType,
            }),
        );

        return `${this.publicUrl}/${this.bucket}/${key}`;
    }
}
