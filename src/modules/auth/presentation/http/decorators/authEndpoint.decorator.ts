import { SetMetadata } from '@nestjs/common';

export const AUTH_ENDPOINT = 'auth:endpoint';

export interface AuthEndpointPolicy {
  mutation: boolean;
  bucket: string;
}

export const AuthEndpoint = (bucket: string, mutation = true) =>
  SetMetadata(AUTH_ENDPOINT, {
    mutation,
    bucket,
  } satisfies AuthEndpointPolicy);
