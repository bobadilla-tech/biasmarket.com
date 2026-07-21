import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

@Injectable()
export class StorageService {
    
    constructor() {
        console.log('S3 CONFIG', {
            endpoint: process.env.S3_ENDPOINT,
            bucket: process.env.S3_BUCKET,
            access: process.env.S3_ACCESS_KEY,
        });
    }
    private client = new S3Client({
        region: 'us-east-1',
        endpoint: process.env.S3_ENDPOINT, 
        forcePathStyle: true, // requerido por MinIO
        credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY!,
            secretAccessKey: process.env.S3_SECRET_KEY!,
        },
    });

    async uploadImage(buffer: Buffer, mimeType: string): Promise<string> {
        const ext = mimeType === 'image/png' ? 'png' : 'jpg';
        const key = `products/${randomUUID()}.${ext}`;

        await this.client.send(
            new PutObjectCommand({
                Bucket: process.env.S3_BUCKET,
                Key: key,
                Body: buffer,
                ContentType: mimeType,
            }),
        );

        return `${process.env.S3_PUBLIC_URL}/${process.env.S3_BUCKET}/${key}`;
    }
}