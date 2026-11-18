import { env } from '../config/env.js';
import { type ResolvedTrack } from './types.js';

export type LoopMode = 'off' | 'track' | 'queue';

export interface QueuedTrack {
  track: ResolvedTrack;
  requesterId: string;
  requestedAt: number;
}

export interface QueueAddResult {
  added: number;
  capped: boolean;
  rejectedReason?: string | undefined;
}

/**
 * Queue manager supporting maximum queue size, per-user limits,
 * Fisher-Yates shuffle, move, remove, and multi-mode looping.
 */
export class TrackQueue {
  private items: QueuedTrack[] = [];
  public loopMode: LoopMode = 'off';
  public current: QueuedTrack | null = null;
  public readonly maxQueueSize: number;
  public readonly maxPerUser: number;

  constructor(options: { maxQueueSize?: number; maxPerUser?: number } = {}) {
    this.maxQueueSize = options.maxQueueSize ?? env.MAX_QUEUE_SIZE;
    this.maxPerUser = options.maxPerUser ?? env.MAX_PER_USER_QUEUE;
  }

  /**
   * Current number of waiting items in the queue (excluding the currently playing track).
   */
  public get size(): number {
    return this.items.length;
  }

  /**
   * Total duration in milliseconds of all tracks currently in the queue.
   */
  public get totalDuration(): number {
    return this.items.reduce((sum, item) => sum + item.track.duration, 0);
  }

  /**
   * Read-only view of queue items.
   */
  public get list(): readonly QueuedTrack[] {
    return this.items;
  }

  /**
   * Checks how many tracks in the queue belong to a specific user.
   */
  public getUserTrackCount(userId: string): number {
    return this.items.filter((item) => item.requesterId === userId).length;
  }

  /**
   * Adds a single track to the queue, validating against max queue size and per-user limits.
   */
  public addTrack(track: ResolvedTrack, requesterId: string): QueueAddResult {
    if (this.size >= this.maxQueueSize) {
      return {
        added: 0,
        capped: true,
        rejectedReason: `Queue is full (maximum capacity is ${this.maxQueueSize} tracks).`,
      };
    }

    const userCount = this.getUserTrackCount(requesterId);
    if (userCount >= this.maxPerUser) {
      return {
        added: 0,
        capped: true,
        rejectedReason: `You have reached your limit of ${this.maxPerUser} queued tracks.`,
      };
    }

    this.items.push({
      track,
      requesterId,
      requestedAt: Date.now(),
    });

    return { added: 1, capped: false };
  }

  /**
   * Adds multiple tracks (e.g. from a playlist), capping at per-user and queue limits.
   */
  public addTracks(tracks: ResolvedTrack[], requesterId: string): QueueAddResult {
    const userCurrent = this.getUserTrackCount(requesterId);
    const userRemaining = Math.max(0, this.maxPerUser - userCurrent);
    const queueRemaining = Math.max(0, this.maxQueueSize - this.size);

    const allowedCount = Math.min(tracks.length, userRemaining, queueRemaining);

    if (allowedCount === 0) {
      if (userRemaining === 0) {
        return {
          added: 0,
          capped: true,
          rejectedReason: `You have reached your limit of ${this.maxPerUser} queued tracks.`,
        };
      }
      return {
        added: 0,
        capped: true,
        rejectedReason: `Queue is full (maximum capacity is ${this.maxQueueSize} tracks).`,
      };
    }

    const now = Date.now();
    for (let i = 0; i < allowedCount; i++) {
      const track = tracks[i]!;
      this.items.push({
        track,
        requesterId,
        requestedAt: now,
      });
    }

    return {
      added: allowedCount,
      capped: allowedCount < tracks.length,
      rejectedReason:
        allowedCount < tracks.length
          ? `Added ${allowedCount} tracks (capped by limits).`
          : undefined,
    };
  }

  /**
   * Advances the queue and returns the next track to play based on the active loop mode.
   *
   * Loop modes:
   * - 'track': returns the current track again without advancing
   * - 'queue': appends current track to the end of the queue, then shifts next
   * - 'off': shifts next track from queue
   */
  public next(): QueuedTrack | null {
    if (this.loopMode === 'track' && this.current) {
      return this.current;
    }

    if (this.loopMode === 'queue' && this.current) {
      this.items.push(this.current);
    }

    this.current = this.items.shift() ?? null;
    return this.current;
  }

  /**
   * Skips to next track, explicitly overriding 'track' loop mode for this invocation.
   */
  public skip(): QueuedTrack | null {
    if (this.loopMode === 'queue' && this.current) {
      this.items.push(this.current);
    }

    this.current = this.items.shift() ?? null;
    return this.current;
  }

  /**
   * Shuffles the waiting queue using the Fisher-Yates algorithm.
   */
  public shuffle(): void {
    for (let i = this.items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = this.items[i]!;
      this.items[i] = this.items[j]!;
      this.items[j] = temp;
    }
  }

  /**
   * Removes a track at a specific 0-based index.
   */
  public remove(index: number): QueuedTrack | undefined {
    if (index < 0 || index >= this.items.length) {
      return undefined;
    }
    const [removed] = this.items.splice(index, 1);
    return removed;
  }

  /**
   * Moves a track from one index to another.
   */
  public move(fromIndex: number, toIndex: number): boolean {
    if (
      fromIndex < 0 ||
      fromIndex >= this.items.length ||
      toIndex < 0 ||
      toIndex >= this.items.length ||
      fromIndex === toIndex
    ) {
      return false;
    }

    const [item] = this.items.splice(fromIndex, 1);
    if (!item) return false;
    this.items.splice(toIndex, 0, item);
    return true;
  }

  /**
   * Clears all waiting items in the queue.
   */
  public clear(): number {
    const count = this.items.length;
    this.items = [];
    return count;
  }

  /**
   * Sets loop mode ('off' | 'track' | 'queue').
   */
  public setLoopMode(mode: LoopMode): void {
    this.loopMode = mode;
  }

  /**
   * Resets entire queue including current track.
   */
  public reset(): void {
    this.items = [];
    this.current = null;
    this.loopMode = 'off';
  }
}

