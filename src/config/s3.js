import { S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
dotenv.config();

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

export const S3_REGION = process.env.AWS_REGION || 'ap-south-1';
export const S3_BUCKET = process.env.AWS_S3_BUCKET_NAME;

// Optional custom domain in front of the bucket (e.g. a CloudFront
// distribution). Falls back to the bucket's own virtual-hosted-style URL
// when unset. CloudFront domains are usually given bare (no protocol).
const cloudfrontDomain = (process.env.AWS_CLOUDFRONT_DOMAIN || '').replace(/\/$/, '');
export const S3_PUBLIC_BASE_URL = cloudfrontDomain
    ? (cloudfrontDomain.startsWith('http') ? cloudfrontDomain : `https://${cloudfrontDomain}`)
    : '';

if (!process.env.AWS_REGION || !accessKeyId || !secretAccessKey || !S3_BUCKET) {
    console.warn('Missing AWS S3 environment variables. Please check your .env file.');
}

export const s3Client = new S3Client({
    region: S3_REGION,
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
});
