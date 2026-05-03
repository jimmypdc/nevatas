// AWS KMS driver. Stubbed in Phase 1 — selecting KMS_DRIVER=aws will throw
// at startup with a pointer to this file so the operator wires it before
// touching production data.
//
// Wiring checklist when ready:
//
//   1. npm install @aws-sdk/client-kms
//
//   2. Create a customer-managed KMS key in the production AWS account.
//      Restrict its key policy to:
//        - the application's IAM role (kms:Encrypt, kms:Decrypt, kms:GenerateDataKey)
//        - the security/operations role for break-glass administration
//        - DENY everyone else, including root, except via key-policy update
//      Enable automatic annual rotation (KMS rotates the backing key without
//      changing the ARN).
//
//   3. Set AWS_KMS_KEY_ID in the secrets manager to the key ARN. Do NOT use
//      a key alias — aliases are mutable and can be redirected by an
//      attacker with kms:UpdateAlias.
//
//   4. Replace the bodies of wrapDek / unwrapDek below with the AWS SDK
//      calls noted inline.
//
//   5. Verify the integration by booting a non-prod environment first and
//      running the encryption.test.ts suite under KMS_DRIVER=aws.
//
//   6. Backfill: any v1 / env-driver ciphertext in the DB should be re-
//      encrypted via reEncryptField (see crypto/encryption.ts) so the
//      env-key fallback can be removed from production code paths.

import type { KmsDriver } from "@/lib/kms/driver";
import { env } from "@/lib/env";

export class AwsKmsDriver implements KmsDriver {
  readonly name = "aws" as const;
  readonly activeKekId: string;

  constructor() {
    const keyId = process.env.AWS_KMS_KEY_ID;
    if (!keyId || !keyId.startsWith("arn:aws:kms:")) {
      throw new Error(
        "AWS_KMS_KEY_ID must be set to a KMS key ARN (not an alias) when KMS_DRIVER=aws",
      );
    }
    this.activeKekId = keyId;
    // Touch env() so unrelated misconfiguration surfaces at startup.
    env();
  }

  async wrapDek(_dek: Buffer): Promise<Buffer> {
    // Production implementation:
    //
    //   const client = new KMSClient({ region: env().S3_REGION });
    //   const result = await client.send(new EncryptCommand({
    //     KeyId: this.activeKekId,
    //     Plaintext: _dek,
    //     EncryptionAlgorithm: "SYMMETRIC_DEFAULT",
    //   }));
    //   return Buffer.from(result.CiphertextBlob!);
    throw new Error(
      "AwsKmsDriver.wrapDek is not implemented. See lib/kms/aws.ts for the wiring checklist.",
    );
  }

  async unwrapDek(_wrappedDek: Buffer, kekId: string): Promise<Buffer> {
    if (kekId !== this.activeKekId) {
      // After a manual key rotation an old kekId would still appear on
      // legacy ciphertexts; route to the prior driver via the registry.
      throw new Error(`AwsKmsDriver cannot unwrap legacy kekId=${kekId}`);
    }
    //   const client = new KMSClient({ region: env().S3_REGION });
    //   const result = await client.send(new DecryptCommand({
    //     KeyId: this.activeKekId,
    //     CiphertextBlob: _wrappedDek,
    //     EncryptionAlgorithm: "SYMMETRIC_DEFAULT",
    //   }));
    //   return Buffer.from(result.Plaintext!);
    throw new Error(
      "AwsKmsDriver.unwrapDek is not implemented. See lib/kms/aws.ts for the wiring checklist.",
    );
  }
}
