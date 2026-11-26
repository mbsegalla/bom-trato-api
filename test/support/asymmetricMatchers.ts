import { expect } from 'vitest';

// Asymmetric matchers describe expected values, not actual domain data.
// Vitest exposes their return values as any; keep that boundary typed as unknown.
export const asymmetric = {
  any: (constructor: Parameters<typeof expect.any>[0]): unknown => expect.any(constructor),
  anything: (): unknown => expect.anything(),
  objectContaining: (value: Parameters<typeof expect.objectContaining<object>>[0]): unknown =>
    expect.objectContaining<object>(value),
  arrayContaining: (value: Parameters<typeof expect.arrayContaining<unknown>>[0]): unknown =>
    expect.arrayContaining<unknown>(value),
  stringContaining: (value: string): unknown => expect.stringContaining(value),
  stringMatching: (value: string | RegExp): unknown => expect.stringMatching(value),
  not: {
    stringContaining: (value: string): unknown => expect.not.stringContaining(value),
    stringMatching: (value: string | RegExp): unknown => expect.not.stringMatching(value),
    objectContaining: (value: Parameters<typeof expect.not.objectContaining<object>>[0]): unknown =>
      expect.not.objectContaining<object>(value),
    arrayContaining: (value: Parameters<typeof expect.not.arrayContaining<unknown>>[0]): unknown =>
      expect.not.arrayContaining<unknown>(value),
  },
};
