import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as presign } from '@aws-sdk/s3-request-presigner';
import path from 'path';
import { s3Client, S3_BUCKET, S3_REGION, S3_PUBLIC_BASE_URL } from '../config/s3.js';

const CONTENT_TYPES = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
};

const publicUrlFor = (key) => {
    if (S3_PUBLIC_BASE_URL) return `${S3_PUBLIC_BASE_URL}/${key}`;
    return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
};

/**
 * Uploads a file buffer to S3 under `folder/` and returns its public URL and
 * key. Images are kept on a public-read bucket/prefix (see
 * docs/AWS_S3_SETUP.md) since every image this app stores — profile,
 * service, practitioner, space — is meant to be publicly viewable, the same
 * way the previous Supabase Storage public URLs worked.
 */
export const uploadBuffer = async (buffer, originalname, folder = 'uploads') => {
    const ext = path.extname(originalname).toLowerCase();
    // A random suffix (not just Date.now()) avoids collisions when several
    // files from the same request upload concurrently and land in the same
    // millisecond.
    const key = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;

    await s3Client.send(new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: CONTENT_TYPES[ext] || 'application/octet-stream',
    }));

    return { url: publicUrlFor(key), key };
};

/**
 * Deletes an object from S3 by key. Best-effort by convention at call
 * sites — an orphaned object isn't worth failing a request over.
 */
export const deleteObject = async (key) => {
    if (!key) return;
    await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
};

/**
 * Generates a time-limited presigned URL for private, non-public objects.
 * Nothing in this app currently stores private images, but this is here so
 * any future private asset (e.g. an internal document) can reuse the same
 * bucket securely instead of making it public.
 */
export const getSignedDownloadUrl = async (key, expiresInSeconds = 3600) => {
    return presign(s3Client, new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }), { expiresIn: expiresInSeconds });
};
