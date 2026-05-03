// S3 / R2 storage driver. R2 is S3-compatible: set S3_ENDPOINT to the R2
// endpoint URL and the same driver works.
//
// Production wiring requirements:
//   - Bucket has ALL public access blocked.
//   - Bucket has versioning enabled (so a corrupted overwrite is recoverable).
//   - Server-side encryption enforced via bucket policy (SSE-KMS or SSE-S3).
//   - Lifecycle rule deletes incomplete multipart uploads after 1 day.
//   - The IAM role this app runs under is restricted to s3:PutObject /
//     s3:GetObject / s3:HeadObject on this single bucket. No List, no Delete.
//   - CORS rule allows PUT from your APP_URL origin only (required for direct
//     browser upload via the presigned URL).

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "@/lib/env";
import type {
  HeadObjectResult,
  PutObjectInput,
  SignedDownloadInput,
  SignedUploadInput,
  SignedUploadResult,
  StorageDriver,
} from "@/lib/storage/driver";

const DEFAULT_DOWNLOAD_EXPIRES_S = 5 * 60;
const DEFAULT_UPLOAD_EXPIRES_S = 10 * 60;

export class S3StorageDriver implements StorageDriver {
  readonly name: "s3" | "r2";
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(driverName: "s3" | "r2") {
    this.name = driverName;
    const e = env();
    if (!e.S3_BUCKET) {
      throw new Error(`S3_BUCKET must be set when STORAGE_DRIVER=${driverName}`);
    }
    if (!e.S3_REGION) {
      throw new Error(`S3_REGION must be set when STORAGE_DRIVER=${driverName}`);
    }
    this.bucket = e.S3_BUCKET;

    // Credentials resolution intentionally delegated to the AWS SDK default
    // chain (env, EC2 instance metadata, ECS task role, etc.) when neither
    // S3_ACCESS_KEY_ID nor S3_SECRET_ACCESS_KEY is set. That's the right
    // posture in production where short-lived role-assumed creds beat
    // long-lived static keys.
    const explicitCreds =
      e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY }
        : undefined;

    this.client = new S3Client({
      region: e.S3_REGION,
      endpoint: e.S3_ENDPOINT || undefined,
      // R2 (and other S3-compatible stores) require path-style addressing.
      forcePathStyle: driverName === "r2",
      credentials: explicitCreds,
    });
  }

  async putObject(input: PutObjectInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ChecksumAlgorithm: "SHA256",
      }),
    );
  }

  async getObject(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!result.Body) throw new Error(`S3 object ${key} has no body`);
    // The SDK exposes Body as a stream in Node. Collect it into a Buffer.
    const chunks: Uint8Array[] = [];
    for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async signedUploadUrl(input: SignedUploadInput): Promise<SignedUploadResult> {
    // S3-native checksum: include the SHA-256 in the signed PUT so S3
    // rejects the upload if the body doesn't match. We sign the digest as
    // base64 because that's the on-the-wire format S3 expects.
    const sha256B64 = Buffer.from(input.sha256Hex, "hex").toString("base64");
    const expiresIn = input.expiresInSeconds ?? DEFAULT_UPLOAD_EXPIRES_S;

    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.sizeBytes,
      ChecksumSHA256: sha256B64,
    });

    const uploadUrl = await getSignedUrl(this.client, cmd, {
      expiresIn,
      // Sign the headers we'll require the client to send so the URL can't
      // be reused with a different content-type or checksum.
      signableHeaders: new Set(["content-type", "content-length", "x-amz-checksum-sha256"]),
    });

    return {
      uploadUrl,
      method: "PUT",
      requiredHeaders: {
        "Content-Type": input.contentType,
        "Content-Length": String(input.sizeBytes),
        "x-amz-checksum-sha256": sha256B64,
      },
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }

  async signedDownloadUrl(input: SignedDownloadInput): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: input.key });
    return getSignedUrl(this.client, cmd, {
      expiresIn: input.expiresInSeconds ?? DEFAULT_DOWNLOAD_EXPIRES_S,
    });
  }

  async headObject(key: string): Promise<HeadObjectResult> {
    const result = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key, ChecksumMode: "ENABLED" }),
    );
    if (typeof result.ContentLength !== "number") {
      throw new Error(`S3 HeadObject for ${key} did not return ContentLength`);
    }
    return {
      sizeBytes: result.ContentLength,
      contentType: result.ContentType,
      etag: result.ETag,
      sha256Hex: result.ChecksumSHA256
        ? Buffer.from(result.ChecksumSHA256, "base64").toString("hex")
        : undefined,
    };
  }
}
