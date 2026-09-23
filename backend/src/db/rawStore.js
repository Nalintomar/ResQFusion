import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/index.js';

/**
 * Raw-payload archive (Section 4.1: "store the raw payloads in cloud storage").
 * Default: newline-delimited JSON files under ./storage/raw/<source>/<date>.jsonl
 * If S3_BUCKET is set and `@aws-sdk/client-s3` is installed, batches are written to S3 instead.
 */
export function createRawStore(cfg = config, log = console) {
  const dir = path.resolve(process.cwd(), 'storage', 'raw');
  let s3 = null;
  let s3Ready = false;

  async function initS3() {
    if (s3Ready || !cfg.s3Bucket) return;
    s3Ready = true;
    try {
      const mod = await import('@aws-sdk/client-s3');
      s3 = { client: new mod.S3Client({ region: cfg.awsRegion }), PutObjectCommand: mod.PutObjectCommand };
      log.info?.(`[raw] archiving to s3://${cfg.s3Bucket}`);
    } catch {
      log.warn?.('[raw] S3_BUCKET set but @aws-sdk/client-s3 is not installed; writing to local disk');
    }
  }

  return {
    get target() {
      return s3 ? `s3://${cfg.s3Bucket}` : dir;
    },
    async save(source, payload) {
      await initS3();
      const now = new Date();
      const line = JSON.stringify({ ts: now.toISOString(), source, payload }) + '\n';
      try {
        if (s3) {
          const key = `raw/${source}/${now.toISOString().slice(0, 10)}/${now.getTime()}.json`;
          await s3.client.send(new s3.PutObjectCommand({ Bucket: cfg.s3Bucket, Key: key, Body: line, ContentType: 'application/json' }));
        } else {
          const d = path.join(dir, source);
          await fs.mkdir(d, { recursive: true });
          await fs.appendFile(path.join(d, `${now.toISOString().slice(0, 10)}.jsonl`), line);
        }
      } catch (e) {
        log.warn?.(`[raw] archive failed: ${e.message}`);
      }
    },
  };
}
