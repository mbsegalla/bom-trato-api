export function readJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected a JSON object in the test response');
  }
  return value as Record<string, unknown>;
}

export function readJsonString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Expected a JSON string in the test response');
  }
  return value;
}
