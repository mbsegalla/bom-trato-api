import { describe, expect, it, vi } from 'vitest';

import { validationExceptionFactory } from './validationException.factory.js';

describe('validation exception factory', () => {
  it('returns nested field paths without echoing targets or rejected values', () => {
    const error = validationExceptionFactory([
      {
        property: 'items',
        children: [
          {
            property: '0',
            children: [
              {
                property: 'amount',
                constraints: { isInt: 'must be integer' },
                value: 'private',
                target: { secret: 'private' },
              },
            ],
          },
        ],
      },
      {
        property: 'name',
        constraints: { isNotEmpty: 'required' },
        value: 'private',
      },
    ]);

    expect(error.getStatus()).toBe(400);
    expect(error.publicError).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [
        { field: 'items.0.amount', messages: ['must be integer'] },
        { field: 'name', messages: ['required'] },
      ],
    });
    expect(JSON.stringify(error.publicError)).not.toContain('private');
  });
});
