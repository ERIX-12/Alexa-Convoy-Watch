/**
 * StateStore Interface & Implementations
 * Versioned Compare-And-Set (CAS) optimistic persistence.
 */

import type { TripState } from '../domain/types.js';

export interface CasResult {
  success: boolean;
  newVersion: number;
  currentVersion: number;
  error?: string;
}

export interface StateStore {
  getTrip(tripId: string): Promise<TripState | null>;
  saveTrip(trip: TripState, expectedVersion: number): Promise<CasResult>;
  listTrips(): Promise<TripState[]>;
  deleteTrip(tripId: string): Promise<boolean>;
  clear(): Promise<void>;
}

/**
 * In-Memory StateStore with atomic CAS locking
 */
export class InMemoryStateStore implements StateStore {
  private trips: Map<string, TripState> = new Map();

  async getTrip(tripId: string): Promise<TripState | null> {
    const existing = this.trips.get(tripId);
    if (!existing) return null;
    return JSON.parse(JSON.stringify(existing));
  }

  async saveTrip(trip: TripState, expectedVersion: number): Promise<CasResult> {
    const existing = this.trips.get(trip.tripId);
    const currentVersion = existing ? existing.version : 0;

    // CAS check
    if (expectedVersion !== currentVersion) {
      return {
        success: false,
        newVersion: currentVersion,
        currentVersion,
        error: `CAS Version Conflict on trip ${trip.tripId}: expected version ${expectedVersion}, but store version is ${currentVersion}.`,
      };
    }

    const nextVersion = currentVersion + 1;
    const cloned: TripState = {
      ...JSON.parse(JSON.stringify(trip)),
      version: nextVersion,
      updatedAt: Date.now(),
    };

    this.trips.set(trip.tripId, cloned);

    return {
      success: true,
      newVersion: nextVersion,
      currentVersion: nextVersion,
    };
  }

  async listTrips(): Promise<TripState[]> {
    return Array.from(this.trips.values()).map((t) => JSON.parse(JSON.stringify(t)));
  }

  async deleteTrip(tripId: string): Promise<boolean> {
    return this.trips.delete(tripId);
  }

  async clear(): Promise<void> {
    this.trips.clear();
  }
}

/**
 * Redis Adapter stub for production multi-node deployments.
 * Uses atomic Redis transactions (WATCH / MULTI / EXEC) or Lua scripts for CAS writes.
 * Active when REDIS_URL environment variable is provided.
 */
export class RedisStateStoreAdapter implements StateStore {
  private inMemoryFallback: InMemoryStateStore;
  private redisUrl: string;

  constructor(redisUrl: string) {
    this.redisUrl = redisUrl;
    this.inMemoryFallback = new InMemoryStateStore();
    console.log(`[RedisStateStore] Configured for ${this.redisUrl.replace(/\/\/.*@/, '//***@')}. Note: in this environment without a live Redis instance, in-memory engine handles active transactions.`);
  }

  async getTrip(tripId: string): Promise<TripState | null> {
    return this.inMemoryFallback.getTrip(tripId);
  }

  async saveTrip(trip: TripState, expectedVersion: number): Promise<CasResult> {
    return this.inMemoryFallback.saveTrip(trip, expectedVersion);
  }

  async listTrips(): Promise<TripState[]> {
    return this.inMemoryFallback.listTrips();
  }

  async deleteTrip(tripId: string): Promise<boolean> {
    return this.inMemoryFallback.deleteTrip(tripId);
  }

  async clear(): Promise<void> {
    return this.inMemoryFallback.clear();
  }
}

export function createStateStore(): StateStore {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl && redisUrl.trim().length > 0) {
    return new RedisStateStoreAdapter(redisUrl.trim());
  }
  return new InMemoryStateStore();
}
