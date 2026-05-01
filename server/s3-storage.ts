import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function envFirst(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim().length > 0) return value;
  }
  return undefined;
}

const region = envFirst("MINIO_REGION", "S3_REGION") || "us-east-1";
const endpoint = envFirst("MINIO_ENDPOINT", "S3_ENDPOINT");
const forcePathStyle = (envFirst("MINIO_FORCE_PATH_STYLE", "S3_FORCE_PATH_STYLE") || "true").toLowerCase() === "true";

function getS3Client() {
  return new S3Client({
    region,
    endpoint,
    forcePathStyle,
    credentials:
      envFirst("MINIO_ACCESS_KEY", "S3_ACCESS_KEY_ID") && envFirst("MINIO_SECRET_KEY", "S3_SECRET_ACCESS_KEY")
        ? {
            accessKeyId: envFirst("MINIO_ACCESS_KEY", "S3_ACCESS_KEY_ID")!,
            secretAccessKey: envFirst("MINIO_SECRET_KEY", "S3_SECRET_ACCESS_KEY")!,
          }
        : undefined,
  });
}

export function getDefaultBucket() {
  return envFirst("MINIO_BUCKET", "S3_BUCKET") || "easyfuel-private";
}

export function buildS3ObjectPath() {
  return `uploads/${randomUUID()}`;
}

export async function uploadBufferToS3(params: {
  bucket: string;
  key: string;
  body: Buffer;
  contentType?: string;
}) {
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType || "application/octet-stream",
    }),
  );
}

export async function createS3SignedGetUrl(params: { bucket: string; key: string; expiresInSec?: number }) {
  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: params.bucket,
    Key: params.key,
  });
  return getSignedUrl(client, command, { expiresIn: params.expiresInSec || 3600 });
}

