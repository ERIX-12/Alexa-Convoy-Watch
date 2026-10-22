import { createHmac } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { AuditRecord } from '../domain/types.js';

export const GENESIS_HASH = 'GENESIS_CONVOY_WATCH_V1_7c9f8b4e2a1d0f5e3c8b6a9d';

export class AuditLog {
  private records: AuditRecord[] = [];
  private appendLock: Promise<void> = Promise.resolve();
  private filePath: string | null = null;
  private hmacSecret: string;

  constructor(hmacSecret: string, filePath?: string) {
    this.hmacSecret = hmacSecret;
    if (filePath) {
      this.filePath = filePath;
    }
  }

  /**
   * Initializes the audit log from existing file or initializes with genesis state.
   */
  async init(): Promise<void> {
    if (this.filePath) {
      try {
        const data = await fs.readFile(this.filePath, 'utf-8');
        const lines = data.split('\n').filter((l) => l.trim().length > 0);
        this.records = lines.map((line) => JSON.parse(line) as AuditRecord);
      } catch (err: unknown) {
        // If file doesn't exist, start fresh
        const nodeErr = err as { code?: string };
        if (nodeErr.code !== 'ENOENT') {
          console.error('[AuditLog] Error reading audit file:', err);
        }
      }
    }
  }

  /**
   * Calculates HMAC SHA-256 for an audit record.
   */
  calculateHash(
    prevHash: string,
    sequence: number,
    timestamp: number,
    eventType: string,
    tripId: string,
    actor: string,
    payload: Record<string, unknown>
  ): string {
    const payloadStr = JSON.stringify(payload, Object.keys(payload).sort());
    const dataString = `${prevHash}|${sequence}|${timestamp}|${eventType}|${tripId}|${actor}|${payloadStr}`;
    return createHmac('sha256', this.hmacSecret).update(dataString).digest('hex');
  }

  /**
   * Thread-safe append-only append operation with mutex serialization.
   */
  async append(
    eventType: AuditRecord['eventType'],
    tripId: string,
    actor: string,
    payload: Record<string, unknown>
  ): Promise<AuditRecord> {
    return new Promise((resolve, reject) => {
      this.appendLock = this.appendLock.then(async () => {
        try {
          const sequence = this.records.length;
          const prevHash =
            sequence === 0
              ? GENESIS_HASH
              : this.records[sequence - 1].hash;
          const timestamp = Date.now();

          const hash = this.calculateHash(
            prevHash,
            sequence,
            timestamp,
            eventType,
            tripId,
            actor,
            payload
          );

          const record: AuditRecord = {
            sequence,
            prevHash,
            hash,
            timestamp,
            eventType,
            tripId,
            actor,
            payload,
          };

          this.records.push(record);

          if (this.filePath) {
            try {
              await fs.mkdir(path.dirname(this.filePath), { recursive: true });
              await fs.appendFile(this.filePath, JSON.stringify(record) + '\n', 'utf-8');
            } catch (fsErr) {
              console.error('[AuditLog] Warning: failed to persist to disk:', fsErr);
            }
          }

          resolve(record);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  getRecords(tripId?: string): AuditRecord[] {
    if (tripId) {
      return this.records.filter((r) => r.tripId === tripId);
    }
    return [...this.records];
  }

  getLastRecord(): AuditRecord | null {
    if (this.records.length === 0) return null;
    return this.records[this.records.length - 1];
  }

  /**
   * Tamper-detection algorithm:
   * Verifies the entire cryptographic hash chain.
   */
  verifyChain(records: AuditRecord[]): {
    valid: boolean;
    badRecordIndex?: number;
    reason?: string;
  } {
    if (records.length === 0) {
      return { valid: true };
    }

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];

      // 1. Sequence check
      if (rec.sequence !== i) {
        return {
          valid: false,
          badRecordIndex: i,
          reason: `Broken sequence at index ${i}: expected ${i}, found ${rec.sequence}`,
        };
      }

      // 2. Previous hash check
      const expectedPrevHash = i === 0 ? GENESIS_HASH : records[i - 1].hash;
      if (rec.prevHash !== expectedPrevHash) {
        return {
          valid: false,
          badRecordIndex: i,
          reason: `Broken hash link at index ${i}: prevHash '${rec.prevHash}' != expected '${expectedPrevHash}'`,
        };
      }

      // 3. Cryptographic hash check
      const recalculated = this.calculateHash(
        rec.prevHash,
        rec.sequence,
        rec.timestamp,
        rec.eventType,
        rec.tripId,
        rec.actor,
        rec.payload
      );

      if (recalculated !== rec.hash) {
        return {
          valid: false,
          badRecordIndex: i,
          reason: `Tampered hash at index ${i}: stored '${rec.hash}' != computed '${recalculated}'`,
        };
      }
    }

    return { valid: true };
  }
}
