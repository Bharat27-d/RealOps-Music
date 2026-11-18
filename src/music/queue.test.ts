import { describe, it, expect, beforeEach } from 'vitest';
import { TrackQueue } from './queue.js';
import { type ResolvedTrack } from './types.js';

function createTrack(title: string): ResolvedTrack {
  return {
    encoded: `mock-encoded-${title}`,
    identifier: `id-${title}`,
    title,
    author: 'Test Artist',
    duration: 180000,
    uri: `https://example.com/${title}`,
    sourceName: 'youtube',
    isStream: false,
  };
}

describe('TrackQueue', () => {
  let queue: TrackQueue;

  beforeEach(() => {
    queue = new TrackQueue({ maxQueueSize: 5, maxPerUser: 3 });
  });

  describe('addTrack & Limits', () => {
    it('adds tracks successfully within limits', () => {
      const res = queue.addTrack(createTrack('Track 1'), 'user-1');
      expect(res.added).toBe(1);
      expect(res.capped).toBe(false);
      expect(queue.size).toBe(1);
    });

    it('enforces per-user limit', () => {
      queue.addTrack(createTrack('Track 1'), 'user-1');
      queue.addTrack(createTrack('Track 2'), 'user-1');
      queue.addTrack(createTrack('Track 3'), 'user-1');

      // 4th track from same user should be rejected (maxPerUser = 3)
      const res = queue.addTrack(createTrack('Track 4'), 'user-1');
      expect(res.added).toBe(0);
      expect(res.capped).toBe(true);
      expect(res.rejectedReason).toMatch(/reached your limit/i);
      expect(queue.size).toBe(3);

      // Another user can still add
      const res2 = queue.addTrack(createTrack('Track 4'), 'user-2');
      expect(res2.added).toBe(1);
      expect(queue.size).toBe(4);
    });

    it('enforces global max queue size', () => {
      queue.addTrack(createTrack('T1'), 'user-1');
      queue.addTrack(createTrack('T2'), 'user-1');
      queue.addTrack(createTrack('T3'), 'user-2');
      queue.addTrack(createTrack('T4'), 'user-2');
      queue.addTrack(createTrack('T5'), 'user-3'); // 5 items = maxQueueSize

      const res = queue.addTrack(createTrack('T6'), 'user-3');
      expect(res.added).toBe(0);
      expect(res.capped).toBe(true);
      expect(res.rejectedReason).toMatch(/queue is full/i);
    });

    it('caps bulk track addition when exceeding limits', () => {
      const tracks = [
        createTrack('T1'),
        createTrack('T2'),
        createTrack('T3'),
        createTrack('T4'),
        createTrack('T5'),
      ];

      // user-1 can only add 3
      const res = queue.addTracks(tracks, 'user-1');
      expect(res.added).toBe(3);
      expect(res.capped).toBe(true);
      expect(queue.size).toBe(3);
    });
  });

  describe('Loop Modes & Queue Progression', () => {
    beforeEach(() => {
      queue.addTrack(createTrack('Track A'), 'user-1');
      queue.addTrack(createTrack('Track B'), 'user-1');
      queue.addTrack(createTrack('Track C'), 'user-1');
    });

    it('advances sequentially in "off" loop mode', () => {
      expect(queue.loopMode).toBe('off');

      const first = queue.next();
      expect(first?.track.title).toBe('Track A');
      expect(queue.size).toBe(2);

      const second = queue.next();
      expect(second?.track.title).toBe('Track B');
      expect(queue.size).toBe(1);

      const third = queue.next();
      expect(third?.track.title).toBe('Track C');
      expect(queue.size).toBe(0);

      const fourth = queue.next();
      expect(fourth).toBeNull();
    });

    it('repeats the same track in "track" loop mode', () => {
      queue.setLoopMode('track');

      const first = queue.next();
      expect(first?.track.title).toBe('Track A');

      const second = queue.next();
      expect(second?.track.title).toBe('Track A'); // Same track repeated
      expect(queue.size).toBe(2); // Queue does not advance
    });

    it('appends finished track to the end of the queue in "queue" loop mode', () => {
      queue.setLoopMode('queue');

      const first = queue.next(); // Track A becomes current
      expect(first?.track.title).toBe('Track A');

      const second = queue.next(); // Track A appended to back, Track B becomes current
      expect(second?.track.title).toBe('Track B');
      expect(queue.list[queue.size - 1]?.track.title).toBe('Track A');
    });

    it('skips track in "track" loop mode override', () => {
      queue.setLoopMode('track');
      queue.next(); // Track A

      const skipped = queue.skip(); // Explicit skip advances to Track B
      expect(skipped?.track.title).toBe('Track B');
    });
  });

  describe('Queue Manipulation (Move, Remove, Shuffle, Clear)', () => {
    beforeEach(() => {
      queue.addTrack(createTrack('T1'), 'user-1');
      queue.addTrack(createTrack('T2'), 'user-1');
      queue.addTrack(createTrack('T3'), 'user-1');
    });

    it('moves tracks between indices', () => {
      const moved = queue.move(0, 2); // Move T1 to end
      expect(moved).toBe(true);
      expect(queue.list[0]?.track.title).toBe('T2');
      expect(queue.list[1]?.track.title).toBe('T3');
      expect(queue.list[2]?.track.title).toBe('T1');
    });

    it('rejects invalid move indices', () => {
      expect(queue.move(-1, 2)).toBe(false);
      expect(queue.move(0, 99)).toBe(false);
      expect(queue.move(1, 1)).toBe(false);
    });

    it('removes a track at index', () => {
      const removed = queue.remove(1); // Remove T2
      expect(removed?.track.title).toBe('T2');
      expect(queue.size).toBe(2);
      expect(queue.list[0]?.track.title).toBe('T1');
      expect(queue.list[1]?.track.title).toBe('T3');
    });

    it('returns undefined when removing invalid index', () => {
      expect(queue.remove(99)).toBeUndefined();
      expect(queue.remove(-1)).toBeUndefined();
    });

    it('clears all waiting tracks', () => {
      const count = queue.clear();
      expect(count).toBe(3);
      expect(queue.size).toBe(0);
    });

    it('shuffles queue tracks', () => {
      // Add more items to reliably test shuffle
      queue.addTrack(createTrack('T4'), 'user-2');
      queue.addTrack(createTrack('T5'), 'user-2');
      queue.shuffle();
      expect(queue.size).toBe(5);
    });
  });
});

