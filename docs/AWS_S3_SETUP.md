# AWS S3 Image Storage Setup

This backend stores all images — practitioner profile photos, service images, and partner space
galleries — in a single S3 bucket, replacing the previous Supabase Storage buckets
(`practitioner-photos`, `images`). Uploads are mediated by the Node server (multer → S3); nothing
uploads directly from the browser, so the AWS secret key never reaches frontend code.

Objects are organized under these key prefixes:

| Prefix                          | Used by                                   |
|----------------------------------|--------------------------------------------|
| `practitioner-photos/<id>/...`   | Practitioner self-service + admin photo upload |
| `services/...`                   | Practitioner service images                 |
| `spaces/<space_id>/...`          | Partner space galleries                     |
| `uploads/...`                    | Fallback default folder (unused by current routes) |

All of the above are meant to be publicly viewable (they're rendered in plain `<img>` tags across
the site), the same way the previous Supabase public URLs worked — so the bucket is configured for
public read on these prefixes rather than presigned URLs. `src/services/s3.service.js` also exposes
`getSignedDownloadUrl()` for any future private asset that shouldn't be public.

## 1. Create the bucket

```bash
aws s3api create-bucket \
  --bucket kusala-media \
  --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1
```

Use whatever bucket name/region you prefer — just make sure they match `AWS_S3_BUCKET_NAME` /
`AWS_REGION` in `.env`.

Disable "Block all public access" for this bucket (Permissions tab) so the bucket policy below can
take effect — public access is still scoped to the three prefixes above, not the whole bucket.

## 2. Bucket policy (public read, scoped to image prefixes)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadImages",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": [
        "arn:aws:s3:::kusala-media/practitioner-photos/*",
        "arn:aws:s3:::kusala-media/services/*",
        "arn:aws:s3:::kusala-media/spaces/*"
      ]
    }
  ]
}
```

## 3. IAM user for the backend (least privilege)

Create a dedicated IAM user for the app (not your root/admin credentials) with this policy, then
generate an access key for it:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AppReadWriteDelete",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::kusala-media/*"
    }
  ]
}
```

This key can only touch objects inside this one bucket — it has no permission to list other
buckets, change bucket policy, or do anything outside `s3:PutObject`/`GetObject`/`DeleteObject`.

## 4. CORS configuration

Not required for the current server-mediated upload flow (the browser never talks to S3 directly),
but add this if you later add direct browser-to-S3 presigned uploads, or if any frontend code reads
image bytes via `fetch`/canvas instead of a plain `<img src>`:

```json
[
  {
    "AllowedOrigins": ["https://www.kusala.in"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3000
  }
]
```

## 5. Environment variables

Add to `.env` (see `.env.example`):

```
AWS_ACCESS_KEY_ID=<the IAM user's access key>
AWS_SECRET_ACCESS_KEY=<the IAM user's secret key>
AWS_REGION=ap-south-1
AWS_S3_BUCKET_NAME=kusala-media
AWS_CLOUDFRONT_DOMAIN=            # optional, see below
```

### Optional: CloudFront in front of the bucket

If you'd rather not expose the raw S3 URL (or want caching/a custom domain), put a CloudFront
distribution in front of the bucket and set `AWS_CLOUDFRONT_DOMAIN` to its domain (e.g.
`d123abc.cloudfront.net`, with or without `https://`). When set, all uploaded image URLs are built
from this domain instead of the bucket's own `*.s3.amazonaws.com` URL. Leave it blank to skip
CloudFront and serve directly from the bucket.

## 6. Deployment step: raise the reverse proxy's upload limit

The max image size was raised from 5MB to 50MB per file. If you hit a `413 Request Entity Too
Large` again (the same issue the nginx reverse proxy on `kusalabackend.duckdns.org` hit before at
its default 1MB limit), bump `client_max_body_size` to comfortably cover a multi-file space
submission (up to 20 images × 50MB):

```nginx
client_max_body_size 200m;
```

then `sudo nginx -t && sudo systemctl reload nginx`.

## 7. Existing images / migration

Practitioner, service, and space rows already store a full `image_url` in the database from the
previous Supabase Storage setup. Those rows are untouched by this migration — old images keep
loading exactly as before from their existing Supabase URLs. Only new uploads (made after this
change ships) are written to S3. There is no backfill step required; if you want to eventually move
the old images into S3 too, that would be a separate one-off migration script, not part of this
change.
