import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreakerManager } from './circuitBreaker.js';

describe('CircuitBreakerManager', () => {
  let cb: CircuitBreakerManager;

  beforeEach(() => {
    cb = new CircuitBreakerManager({
      failureThreshold: 3,
      windowMs: 1000,
      cooldownMs: 2000,
    });
  });

  it('starts in CLOSED state and allows requests', () => {
    expect(cb.getState('youtube')).toBe('CLOSED');
    expect(cb.isOpen('youtube')).toBe(false);
  });

  it('trips to OPEN after reaching failure threshold', () => {
    cb.recordFailure('youtube');
    cb.recordFailure('youtube');
    expect(cb.isOpen('youtube')).toBe(false);

    cb.recordFailure('youtube'); // 3rd failure
    expect(cb.isOpen('youtube')).toBe(true);
    expect(cb.getState('youtube')).toBe('OPEN');
  });

  it('moves SoundCloud to the front of the fallback order when YouTube breaker is OPEN', () => {
    // Normal order: YTM -> YT -> SoundCloud
    const normalOrder = cb.getOrderedSearchProviders();
    expect(normalOrder[0]?.name).toBe('YouTube Music');

    // Trip YouTube breaker
    cb.recordFailure('youtube');
    cb.recordFailure('youtube');
    cb.recordFailure('youtube');

    // Promoted order: SoundCloud -> YTM -> YT
    const degradedOrder = cb.getOrderedSearchProviders();
    expect(degradedOrder[0]?.name).toBe('SoundCloud');
  });

  it('recovers on recordSuccess', () => {
    cb.recordFailure('youtube');
    cb.recordFailure('youtube');
    cb.recordFailure('youtube');
    expect(cb.isOpen('youtube')).toBe(true);

    cb.recordSuccess('youtube');
    expect(cb.isOpen('youtube')).toBe(false);
    expect(cb.getState('youtube')).toBe('CLOSED');
  });
});

