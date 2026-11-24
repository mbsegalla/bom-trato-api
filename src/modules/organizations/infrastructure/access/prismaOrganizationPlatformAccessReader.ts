import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { readTransaction } from '../../../../infrastructure/database/prismaTransaction.js';
import type { OrganizationPlatformAccessParams } from '../../application/ports/organizationPlatformAccessReader.port.js';
import { OrganizationPlatformAccessReader } from '../../application/ports/organizationPlatformAccessReader.port.js';
import type { OrganizationAccessContext } from '../../domain/policies/organizationAccess.policy.js';

import { readOrganizationAccess } from './prismaOrganizationAccess.js';

@Injectable()
export class PrismaOrganizationPlatformAccessReader extends OrganizationPlatformAccessReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  read(params: OrganizationPlatformAccessParams): Promise<OrganizationAccessContext> {
    return readTransaction(this.prisma, (db) => readOrganizationAccess(db, params));
  }
}
