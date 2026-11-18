import { describe, it, expect } from 'vitest';
import { classifyError } from './classifier.js';

describe('Error Classifier', () => {
  it('classifies YouTube bot-detection / sign-in challenges', () => {
    const err = classifyError('Sign in to confirm you’re not a bot');
    expect(err.category).toBe('bot_detection');
    expect(err.isNodeDegrading).toBe(true);
    expect(err.isRetryableOnAlternateNode).toBe(true);
  });

  it('classifies rate-limit (HTTP 429) errors', () => {
    const err = classifyError('Received 429 Too Many Requests from upstream');
    expect(err.category).toBe('rate_limited');
    expect(err.isNodeDegrading).toBe(true);
    expect(err.isRetryableOnAlternateNode).toBe(true);
  });

  it('classifies age-restricted errors', () => {
    const err = classifyError('Video is age-restricted and requires adult authorization');
    expect(err.category).toBe('age_restricted');
    expect(err.isNodeDegrading).toBe(false);
    expect(err.isRetryableOnAlternateNode).toBe(false);
    expect(err.isRetryableOnAlternateSource).toBe(true);
  });

  it('classifies region-blocked errors', () => {
    const err = classifyError('Video is not available in your country');
    expect(err.category).toBe('region_blocked');
    expect(err.isRetryableOnAlternateSource).toBe(true);
  });

  it('classifies private or deleted videos', () => {
    const err = classifyError('This video is private');
    expect(err.category).toBe('private_track');
    expect(err.isRetryableOnAlternateNode).toBe(false);
  });

  it('classifies SABR unplayable stream errors', () => {
    const err = classifyError('SABR response returned no playable stream');
    expect(err.category).toBe('sabr_unplayable');
    expect(err.isRetryableOnAlternateSource).toBe(true);
  });

  it('classifies connection refused / node down errors', () => {
    const err = classifyError('connect ECONNREFUSED 127.0.0.1:2333');
    expect(err.category).toBe('node_down');
    expect(err.isNodeDegrading).toBe(true);
  });
});

