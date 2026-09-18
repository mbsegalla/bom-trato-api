import type { Prisma } from '../../../../generated/prisma/client.js';
import { OrganizationRole } from '../../../../generated/prisma/enums.js';
import type {
  ListJoinedOrganizationsParams,
  ListMembersParams,
  MemberByEmailParams,
  MemberByIdParams,
  MemberByUserParams,
} from '../../domain/repositories/organizationMember.repository.js';
import { OrganizationMemberRepository } from '../../domain/repositories/organizationMember.repository.js';
import { toOrganizationPage } from '../mappers/organizationPage.mapper.js';

const memberSelect = {
  id: true,
  userId: true,
  role: true,
  createdAt: true,
  user: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.OrganizationMemberSelect;

export class PrismaOrganizationMemberRepository extends OrganizationMemberRepository {
  constructor(private readonly db: Prisma.TransactionClient) {
    super();
  }

  count(organizationId: string) {
    return this.db.organizationMember.count({
      where: { organizationId },
    });
  }

  findByUser(params: MemberByUserParams) {
    const { organizationId, userId } = params;

    return this.db.organizationMember.findFirst({
      where: { organizationId, userId },
      select: memberSelect,
    });
  }

  findById(params: MemberByIdParams) {
    const { organizationId, memberId } = params;
    return this.db.organizationMember.findFirst({
      where: {
        organizationId,
        id: memberId,
      },
      select: memberSelect,
    });
  }

  async existsByEmail(params: MemberByEmailParams): Promise<boolean> {
    const { organizationId, email } = params;

    const count = await this.db.organizationMember.count({
      where: {
        organizationId,
        user: { email },
      },
    });

    return count > 0;
  }

  async add(params: MemberByUserParams): Promise<void> {
    const { organizationId, userId } = params;

    await this.db.organizationMember.create({
      data: {
        organizationId,
        userId,
        role: OrganizationRole.MEMBER,
      },
    });
  }

  async remove(params: MemberByIdParams): Promise<void> {
    const { organizationId, memberId } = params;

    await this.db.organizationMember.delete({
      where: {
        id: memberId,
        organizationId,
      },
    });
  }

  async list(params: ListMembersParams) {
    const rows = await this.db.organizationMember.findMany({
      where: {
        organizationId: params.organizationId,
      },
      select: memberSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: (params.page - 1) * params.limit,
      take: params.limit + 1,
    });

    return toOrganizationPage(rows, params);
  }

  async listJoined(params: ListJoinedOrganizationsParams) {
    const rows = await this.db.organizationMember.findMany({
      where: {
        userId: params.userId,
      },
      select: {
        role: true,
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: (params.page - 1) * params.limit,
      take: params.limit + 1,
    });

    return toOrganizationPage(
      rows.map((row) => ({
        ...row.organization,
        role: row.role,
      })),
      params,
    );
  }
}
