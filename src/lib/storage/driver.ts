// Storage driver interface. Production deploys back this with S3/R2 + signed
// URLs so payroll bytes never travel through the application server. The
// local driver writes to disk under STORAGE_LOCAL_DIR for dev only.

export type PutObjectInput = {
  key: string;
  body: Buffer;
  contentType: string;
};

export type SignedDownloadInput = {
  key: string;
  expiresInSeconds?: number;
};

export type SignedUploadInput = {
  key: string;
  contentType: string;
  sizeBytes: number;
  // Hex-encoded SHA-256 of the bytes the client is about to upload. The S3
  // driver translates this to base64 and includes it in the presigned URL as
  // x-amz-checksum-sha256 so S3 rejects the PUT on mismatch. The local
  // driver verifies it after upload.
  sha256Hex: string;
  expiresInSeconds?: number;
};

export type SignedUploadResult = {
  uploadUrl: string;
  method: "PUT";
  // Headers the client MUST send on the PUT. Includes Content-Type and any
  // checksum/encryption headers the presigned URL was signed against.
  requiredHeaders: Record<string, string>;
  expiresAt: string; // ISO timestamp
};

export type HeadObjectResult = {
  sizeBytes: number;
  contentType?: string;
  etag?: string;
  // Returned when the upload included a SHA-256 checksum (S3 native
  // checksum support, or local driver's post-upload hash).
  sha256Hex?: string;
};

export interface StorageDriver {
  readonly name: "local" | "s3" | "r2";

  putObject(input: PutObjectInput): Promise<void>;
  getObject(key: string): Promise<Buffer>;

  // Returns a short-lived URL the browser can PUT to directly. Required for
  // production: payroll files routinely exceed Vercel's 4.5 MB body limit.
  signedUploadUrl(input: SignedUploadInput): Promise<SignedUploadResult>;

  // Returns a short-lived download URL. For the local driver this is an
  // authenticated internal route.
  signedDownloadUrl(input: SignedDownloadInput): Promise<string>;

  // Verifies an object exists and reports its metadata. Used to confirm a
  // direct-browser upload finished without re-streaming bytes through the app.
  headObject(key: string): Promise<HeadObjectResult>;
}
