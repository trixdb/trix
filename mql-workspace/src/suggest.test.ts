import { describe, expect, it } from 'vitest';
import { editDistance, nearestName } from './suggest.js';

describe('editDistance', () => {
  it('computes small edit distances', () => {
    expect(editDistance('quality', 'quality')).toBe(0);
    expect(editDistance('qualiti', 'quality')).toBe(1);
    expect(editDistance('qualtiy', 'quality')).toBe(2);
  });
  it('caps distance for far-apart strings (early exit)', () => {
    expect(editDistance('abc', 'zzzzzzzzz', 3)).toBe(4);
  });
});

describe('nearestName', () => {
  const fields = ['space', 'quality', 'created', 'entity', 'topic'];
  it('finds the closest candidate within the edit budget', () => {
    expect(nearestName('qualiti', fields)).toBe('quality');
    expect(nearestName('creted', fields)).toBe('created');
  });
  it('returns undefined when nothing is close enough', () => {
    expect(nearestName('xyzzy', fields)).toBeUndefined();
  });
  it('is case-insensitive', () => {
    expect(nearestName('SPACE', fields)).toBe('space');
  });
});
