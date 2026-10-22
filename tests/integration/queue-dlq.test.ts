import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryJobQueue } from '../../server/infrastructure/queue.js';

describe('Job Queue, Exponential Backoff & DLQ Tests', () => {
  it('retries failing jobs and routes to DLQ upon exhausting retries', async () => {
    const queue = new InMemoryJobQueue();
    let callCount = 0;

    queue.registerHandler('flaky_task', async (payload: any) => {
      callCount += 1;
      throw new Error(`Flaky failure attempt ${callCount}`);
    });

    // Enqueue with 3 retries, 10ms initial backoff
    const jobId = await queue.enqueue(
      'flaky_task',
      { data: 'test_payload' },
      { maxRetries: 3, delayMs: 10 }
    );

    // Wait for retries to complete: 10ms + 20ms + 40ms + buffer ~ 150ms
    await new Promise((r) => setTimeout(r, 200));

    assert.equal(callCount, 3);
    const dlq = queue.getDeadLetterQueue();
    assert.equal(dlq.length, 1);
    assert.equal(dlq[0].jobId, jobId);
    assert.equal(dlq[0].attempts, 3);
    assert.ok(dlq[0].finalError.includes('Flaky failure'));
  });

  it('guarantees idempotency when same jobId is re-enqueued', async () => {
    const queue = new InMemoryJobQueue();
    let executions = 0;

    queue.registerHandler('idempotent_task', async () => {
      executions += 1;
    });

    await queue.enqueue('idempotent_task', {}, { jobId: 'FIXED-JOB-ID-100', delayMs: 0 });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(executions, 1);

    // Re-enqueue identical jobId
    await queue.enqueue('idempotent_task', {}, { jobId: 'FIXED-JOB-ID-100', delayMs: 0 });
    await new Promise((r) => setTimeout(r, 50));
    // Execution count must remain 1
    assert.equal(executions, 1);
  });
});
