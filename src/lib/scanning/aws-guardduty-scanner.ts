// AWS GuardDuty Malware Protection scanner (S3 protection plan). Scaffold.
//
// GuardDuty Malware Protection for S3 (GA 2024) automatically scans objects
// on PutObject and tags them with GuardDutyMalwareScanStatus. The app's job
// is to (a) enable the protection plan on the bucket via Terraform / CDK,
// and (b) check the tag (or subscribe to EventBridge findings) before
// releasing the file to downstream pipelines.
//
// Wiring checklist when ready:
//
//   1. Enable GuardDuty in the account; create a Malware Protection plan
//      targeting the production S3 bucket. Tag-based scan results are
//      enabled by default — confirm the IAM service role has the
//      "AWSServiceRoleForAmazonGuardDutyMalwareProtection" policy attached.
//
//   2. Set GUARDDUTY_TAG_KEY (default: "GuardDutyMalwareScanStatus") and
//      AWS_REGION in the deployment environment.
//
//   3. Replace the body of scan() with the GetObjectTagging call below.
//      Tag values map as:
//        NO_THREATS_FOUND     -> clean
//        THREATS_FOUND        -> infected
//        UNSUPPORTED          -> skipped
//        ACCESS_DENIED|FAILED -> error
//
//   4. For real-time visibility, also subscribe an EventBridge rule to
//      "GuardDuty Finding" events and route them to a queue the worker
//      drains; that path can mark a SourceFile infected in seconds rather
//      than the polling latency this driver implies.

import {
  GetObjectTaggingCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { env } from "@/lib/env";
import type { MalwareScanner, ScanResult, ScanVerdict } from "@/lib/scanning/driver";

const TAG_KEY = process.env.GUARDDUTY_TAG_KEY ?? "GuardDutyMalwareScanStatus";

const VERDICT_BY_TAG: Record<string, ScanVerdict> = {
  NO_THREATS_FOUND: "clean",
  THREATS_FOUND: "infected",
  UNSUPPORTED: "skipped",
  ACCESS_DENIED: "error",
  FAILED: "error",
};

export class AwsGuardDutyMalwareScanner implements MalwareScanner {
  readonly name = "aws_guardduty" as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const e = env();
    if (!e.S3_BUCKET || !e.S3_REGION) {
      throw new Error("AWS GuardDuty scanner requires S3_BUCKET and S3_REGION");
    }
    this.bucket = e.S3_BUCKET;
    this.client = new S3Client({
      region: e.S3_REGION,
      endpoint: e.S3_ENDPOINT || undefined,
    });
  }

  async scan(input: { storageKey: string; sizeBytes: number; mimeType: string }): Promise<ScanResult> {
    // Production implementation: poll the tag with backoff (GuardDuty scans
    // typically complete in seconds; tag may take longer to propagate). In
    // a worker context, retry every 2s for up to ~60s before declaring
    // "error" so we don't block parses indefinitely.
    //
    //   const result = await this.client.send(new GetObjectTaggingCommand({
    //     Bucket: this.bucket,
    //     Key: input.storageKey,
    //   }));
    //   const tag = result.TagSet?.find((t) => t.Key === TAG_KEY)?.Value;
    //   if (!tag) return { verdict: "error", provider: "aws_guardduty",
    //     details: { reason: "tag_not_yet_present" } };
    //   const verdict = VERDICT_BY_TAG[tag] ?? "error";
    //   return { verdict, provider: "aws_guardduty", details: { tag } };
    void GetObjectTaggingCommand;
    void TAG_KEY;
    void VERDICT_BY_TAG;
    void this.client;
    void this.bucket;
    void input;
    throw new Error(
      "AwsGuardDutyMalwareScanner.scan is not implemented. See lib/scanning/aws-guardduty-scanner.ts for the wiring checklist.",
    );
  }
}
