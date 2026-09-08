import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ROUTE = 'auth:public';

export const PublicRoute = () => SetMetadata(PUBLIC_ROUTE, true);
