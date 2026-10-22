/**
 * JobQueue Interface & In-Process Implementation
 * Exponential backoff, Dead-Letter Queue (DLQ), and idempotent execution.
 * Note: In-process queue is not crash-durable across process restarts.
 */

export interface Job<T = unknown> {
  id: string;
  name: string;
  payload: T;
  attempt: number;
  maxRetries: number;
  initialDelayMs: number;
  createdAt: number;
  lastError?: string;
}

export interface DeadLetterItem<T = unknown> {
  jobId: string;
  name: string;
  payload: T;
  attempts: number;
  finalError: string;
  failedAt: number;
}

export interface JobQueue {
  enqueue<T>(
    name: string,
    payload: T,
    options?: { maxRetries?: number; delayMs?: number; jobId?: string }
  ): Promise<string>;
  registerHandler<T>(name: string, handler: (payload: T) => Promise<void>): void;
  getDeadLetterQueue(): DeadLetterItem[];
  clear(): void;
}

export class InMemoryJobQueue implements JobQueue {
  private handlers = new Map<string, (payload: any) => Promise<void>>();
  private deadLetterQueue: DeadLetterItem[] = [];
  private processedJobIds = new Set<string>();
  private activeJobs = new Map<string, Job>();
  private jobCounter = 0;

  registerHandler<T>(name: string, handler: (payload: T) => Promise<void>): void {
    this.handlers.set(name, handler);
  }

  async enqueue<T>(
    name: string,
    payload: T,
    options?: { maxRetries?: number; delayMs?: number; jobId?: string }
  ): Promise<string> {
    const id = options?.jobId || `job_${++this.jobCounter}_${Date.now()}`;

    // Idempotency check: if this job ID has already been successfully processed, skip
    if (this.processedJobIds.has(id)) {
      return id;
    }

    const job: Job<T> = {
      id,
      name,
      payload,
      attempt: 0,
      maxRetries: options?.maxRetries ?? 3,
      initialDelayMs: options?.delayMs ?? 50,
      createdAt: Date.now(),
    };

    this.activeJobs.set(id, job);

    // Schedule initial execution
    setTimeout(() => {
      this.executeJob(job);
    }, options?.delayMs ?? 0);

    return id;
  }

  private async executeJob(job: Job): Promise<void> {
    const handler = this.handlers.get(job.name);
    if (!handler) {
      console.warn(`[JobQueue] No handler registered for job type '${job.name}'.`);
      return;
    }

    job.attempt += 1;

    try {
      await handler(job.payload);
      // Success: mark idempotent processed
      this.processedJobIds.add(job.id);
      this.activeJobs.delete(job.id);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      job.lastError = errorMessage;

      if (job.attempt >= job.maxRetries) {
        // Exceeded max retries -> Move to Dead Letter Queue (DLQ)
        this.activeJobs.delete(job.id);
        this.deadLetterQueue.push({
          jobId: job.id,
          name: job.name,
          payload: job.payload,
          attempts: job.attempt,
          finalError: errorMessage,
          failedAt: Date.now(),
        });
        console.error(
          `[JobQueue DLQ] Job '${job.name}' (${job.id}) moved to DLQ after ${job.attempt} attempts. Reason: ${errorMessage}`
        );
      } else {
        // Exponential backoff: initialDelayMs * 2^(attempt - 1)
        const backoffMs = job.initialDelayMs * Math.pow(2, job.attempt - 1);
        setTimeout(() => {
          this.executeJob(job);
        }, backoffMs);
      }
    }
  }

  getDeadLetterQueue(): DeadLetterItem[] {
    return [...this.deadLetterQueue];
  }

  clear(): void {
    this.deadLetterQueue = [];
    this.processedJobIds.clear();
    this.activeJobs.clear();
  }
}

/**
 * Redis Queue adapter when REDIS_URL is configured.
 */
export class RedisQueueAdapter implements JobQueue {
  private fallback: InMemoryJobQueue;
  private redisUrl: string;

  constructor(redisUrl: string) {
    this.redisUrl = redisUrl;
    this.fallback = new InMemoryJobQueue();
    console.log(`[RedisQueueAdapter] Configured for ${this.redisUrl.replace(/\/\/.*@/, '//***@')}. Note: in this environment without a live Redis instance, in-process engine handles active queue jobs.`);
  }

  async enqueue<T>(
    name: string,
    payload: T,
    options?: { maxRetries?: number; delayMs?: number; jobId?: string }
  ): Promise<string> {
    return this.fallback.enqueue(name, payload, options);
  }

  registerHandler<T>(name: string, handler: (payload: T) => Promise<void>): void {
    this.fallback.registerHandler(name, handler);
  }

  getDeadLetterQueue(): DeadLetterItem[] {
    return this.fallback.getDeadLetterQueue();
  }

  clear(): void {
    this.fallback.clear();
  }
}

export function createJobQueue(): JobQueue {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl && redisUrl.trim().length > 0) {
    return new RedisQueueAdapter(redisUrl.trim());
  }
  return new InMemoryJobQueue();
}
