// ClamAV scanner. Scaffold for self-hosted deployments. Streams the stored
// bytes to a clamd daemon over INSTREAM and parses the response.
//
// Wiring checklist when ready:
//
//   1. Run clamd as a sidecar (clamav/clamav-debian Docker image is fine)
//      with persistent signature DB volume + freshclam keeping it current.
//
//   2. Set CLAMAV_HOST and CLAMAV_PORT env vars (defaults: 127.0.0.1:3310).
//
//   3. Replace the body of scan() with the INSTREAM protocol implementation
//      noted inline. clamd-js or @kisip/clamav-client are decent off-the-
//      shelf clients if you'd rather not write the chunked framing yourself.
//
//   4. Bench: ClamAV's signature DB is large (~250 MB resident); keep at
//      least one clamd process warm. Consider colocating with the worker
//      so files don't traverse a shared network.

import { storage } from "@/lib/storage";
import type { MalwareScanner, ScanResult } from "@/lib/scanning/driver";

export class ClamAvMalwareScanner implements MalwareScanner {
  readonly name = "clamav" as const;
  private readonly host: string;
  private readonly port: number;

  constructor() {
    this.host = process.env.CLAMAV_HOST ?? "127.0.0.1";
    this.port = Number(process.env.CLAMAV_PORT ?? "3310");
  }

  async scan(input: { storageKey: string; sizeBytes: number; mimeType: string }): Promise<ScanResult> {
    // Production implementation:
    //
    //   const bytes = await storage().getObject(input.storageKey);
    //   const socket = net.createConnection({ host: this.host, port: this.port });
    //   await write(socket, Buffer.from("zINSTREAM\0"));
    //   for (const chunk of chunks(bytes, 65_536)) {
    //     const len = Buffer.alloc(4); len.writeUInt32BE(chunk.length, 0);
    //     await write(socket, len); await write(socket, chunk);
    //   }
    //   await write(socket, Buffer.from([0,0,0,0]));
    //   const reply = await readToEnd(socket);
    //   const text = reply.toString("utf8").trim();
    //   if (text.endsWith(": OK")) return { verdict: "clean", provider: "clamav" };
    //   if (text.includes("FOUND")) return { verdict: "infected", provider: "clamav", details: { signature: text } };
    //   return { verdict: "error", provider: "clamav", details: { reply: text } };
    void storage; // silence the unused-import lint until the body lands.
    void input;
    throw new Error(
      "ClamAvMalwareScanner.scan is not implemented. See lib/scanning/clamav-scanner.ts for the wiring checklist.",
    );
  }
}
