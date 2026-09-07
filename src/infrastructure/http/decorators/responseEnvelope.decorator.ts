import { SetMetadata } from '@nestjs/common';

export const RESPONSE_ENVELOPE = 'skipResponseEnvelope';

export const SkipResponseEnvelope = () => SetMetadata(RESPONSE_ENVELOPE, true);
