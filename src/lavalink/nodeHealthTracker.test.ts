import { describe, it, expect, beforeEach } from 'vitest';
import { NodeHealthTracker } from './nodeHealthTracker.js';

describe('NodeHealthTracker', () => {
  let tracker: NodeHealthTracker;

  beforeEach(() => {
    tracker = new NodeHealthTracker({
      failureThreshold: 3,
      windowMs: 1000,
      recoveryMs: 2000,
    });
  });

  it('marks node as degraded after reaching bot-check threshold', () => {
    expect(tracker.isDegradedForYouTube('primary')).toBe(false);

    tracker.recordYouTubeFailure('primary');
    tracker.recordYouTubeFailure('primary');
    expect(tracker.isDegradedForYouTube('primary')).toBe(false);

    tracker.recordYouTubeFailure('primary'); // 3rd failure
    expect(tracker.isDegradedForYouTube('primary')).toBe(true);
  });

  it('clears degraded status when success is recorded', () => {
    tracker.recordYouTubeFailure('primary');
    tracker.recordYouTubeFailure('primary');
    tracker.recordYouTubeFailure('primary');
    expect(tracker.isDegradedForYouTube('primary')).toBe(true);

    tracker.recordYouTubeSuccess('primary');
    expect(tracker.isDegradedForYouTube('primary')).toBe(false);
  });
});

