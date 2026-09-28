import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { PublicBusinessProfile } from '../../domain/entities/publicBusinessProfile.entity.js';
import { PublicProfileError } from '../../domain/errors/publicProfile.error.js';
import {
  type PublicProfessionalPageParams,
  PublicProfileRepository,
} from '../../domain/repositories/publicProfile.repository.js';

function ratingAverage(ratingSum: number, ratingCount: number): number | null {
  if (ratingCount === 0) {
    return null;
  }

  return Math.round((ratingSum / ratingCount) * 10) / 10;
}

const publicProfessionalDetailsSelect = {
  slug: true,
  headline: true,
  description: true,
  whatsappEnabled: true,
  whatsappPhone: true,
  ratingSum: true,
  ratingCount: true,
  professionalReviews: {
    orderBy: {
      createdAt: 'desc',
    },
    take: 6,
    select: {
      id: true,
      reviewerDisplayName: true,
      rating: true,
      comment: true,
      createdAt: true,
    },
  },
  organization: {
    select: {
      name: true,
      logoKey: true,
      city: true,
      state: true,
    },
  },
  services: {
    where: {
      catalogService: {
        archivedAt: null,
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      catalogService: {
        select: {
          id: true,
          name: true,
          description: true,
        },
      },
    },
  },
} satisfies Prisma.PublicBusinessProfileSelect;

@Injectable()
export class PrismaPublicProfileRepository extends PublicProfileRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByOrganizationId(organizationId: string) {
    const row = await this.prisma.publicBusinessProfile.findUnique({
      where: {
        organizationId,
      },
      include: {
        services: {
          select: {
            catalogServiceId: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (row === null) {
      return null;
    }

    const { services, ...profile } = row;

    return {
      ...profile,
      serviceIds: services.map((service) => service.catalogServiceId),
    };
  }

  async suggestAvailableSlug(baseSlug: string, organizationId: string): Promise<string> {
    const current = await this.prisma.publicBusinessProfile.findUnique({
      where: {
        slug: baseSlug,
      },
      select: {
        organizationId: true,
      },
    });

    if (current === null || current.organizationId === organizationId) {
      return baseSlug;
    }

    const suffix = organizationId.replaceAll('-', '').slice(0, 10);
    const prefix = baseSlug.slice(0, 120 - suffix.length - 1).replace(/-+$/g, '');

    return `${prefix}-${suffix}`;
  }

  async save(profile: PublicBusinessProfile) {
    const state = profile.snapshot();

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (state.serviceIds.length > 0) {
          const count = await tx.catalogService.count({
            where: {
              id: {
                in: state.serviceIds,
              },
              organizationId: state.organizationId,
              archivedAt: null,
            },
          });

          if (count !== state.serviceIds.length) {
            throw new PublicProfileError('PUBLIC_PROFILE_SERVICE_NOT_FOUND');
          }
        }

        const serviceCreates = state.serviceIds.map((catalogServiceId) => ({ catalogServiceId }));

        const row = await tx.publicBusinessProfile.upsert({
          where: {
            organizationId: state.organizationId,
          },
          create: {
            id: state.id,
            organizationId: state.organizationId,
            slug: state.slug,
            headline: state.headline,
            description: state.description,
            whatsappPhone: state.whatsappPhone,
            whatsappEnabled: state.whatsappEnabled,
            whatsappEnabledAt: state.whatsappEnabledAt,
            published: state.published,
            publishedAt: state.publishedAt,
            createdAt: state.createdAt,
            updatedAt: state.updatedAt,
            services:
              serviceCreates.length > 0
                ? {
                    create: serviceCreates,
                  }
                : undefined,
          },

          update: {
            slug: state.slug,
            headline: state.headline,
            description: state.description,
            whatsappPhone: state.whatsappPhone,
            whatsappEnabled: state.whatsappEnabled,
            whatsappEnabledAt: state.whatsappEnabledAt,
            published: state.published,
            publishedAt: state.publishedAt,
            updatedAt: state.updatedAt,
            services: {
              deleteMany: {},
              ...(serviceCreates.length > 0
                ? {
                    create: serviceCreates,
                  }
                : {}),
            },
          },

          include: {
            services: {
              select: {
                catalogServiceId: true,
              },
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        });

        const { services, ...saved } = row;

        return {
          ...saved,
          serviceIds: services.map((service) => service.catalogServiceId),
        };
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new PublicProfileError('PUBLIC_PROFILE_SLUG_TAKEN');
      }

      throw error;
    }
  }

  async listPublished(params: PublicProfessionalPageParams) {
    const { page, limit, search: searchInput, city: cityInput, state: stateInput } = params;

    const search = searchInput?.trim();
    const city = cityInput?.trim();
    const state = stateInput?.trim().toUpperCase();

    const where: Prisma.PublicBusinessProfileWhereInput = {
      published: true,
      organization: {
        setupCompletedAt: {
          not: null,
        },
        city: city
          ? {
              not: null,
              contains: city,
              mode: 'insensitive',
            }
          : {
              not: null,
            },
        state: state ? state : { not: null },
      },
    };

    if (search) {
      const sanitized = search.replace(/[\\%_]/g, '\\$&');

      where.OR = [
        {
          organization: {
            name: {
              contains: sanitized,
              mode: 'insensitive',
            },
          },
        },
        {
          headline: {
            contains: sanitized,
            mode: 'insensitive',
          },
        },
        {
          description: {
            contains: sanitized,
            mode: 'insensitive',
          },
        },
        {
          services: {
            some: {
              catalogService: {
                archivedAt: null,
                name: {
                  contains: sanitized,
                  mode: 'insensitive',
                },
              },
            },
          },
        },
      ];
    }

    const rows = await this.prisma.publicBusinessProfile.findMany({
      where,
      orderBy: [
        {
          reputationScore: 'desc',
        },
        {
          ratingCount: 'desc',
        },
        {
          publishedAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],

      skip: (page - 1) * limit,
      take: limit + 1,
      select: {
        slug: true,
        headline: true,
        description: true,
        whatsappEnabled: true,
        whatsappPhone: true,
        ratingSum: true,
        ratingCount: true,
        organization: {
          select: {
            name: true,
            logoKey: true,
            city: true,
            state: true,
          },
        },
        services: {
          where: {
            catalogService: {
              archivedAt: null,
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
          take: 3,
          select: {
            catalogService: {
              select: {
                id: true,
                name: true,
                description: true,
              },
            },
          },
        },
      },
    });

    return {
      page,
      hasMore: rows.length > limit,
      items: rows.slice(0, limit).map((row) => ({
        slug: row.slug,
        headline: row.headline,
        description: row.description,
        whatsappAvailable: row.whatsappEnabled && row.whatsappPhone !== null,
        ratingAverage: ratingAverage(row.ratingSum, row.ratingCount),
        ratingCount: row.ratingCount,
        reviews: [],
        organization: {
          name: row.organization.name,
          logoKey: row.organization.logoKey,
          city: row.organization.city!,
          state: row.organization.state!,
        },
        services: row.services.map(({ catalogService }) => catalogService),
      })),
    };
  }

  async findPublishedBySlug(slug: string) {
    const row = await this.prisma.publicBusinessProfile.findFirst({
      where: {
        slug,
        published: true,
        organization: {
          setupCompletedAt: {
            not: null,
          },
          city: {
            not: null,
          },
          state: {
            not: null,
          },
        },
      },
      select: publicProfessionalDetailsSelect,
    });

    if (row === null) {
      return null;
    }

    return {
      slug: row.slug,
      headline: row.headline,
      description: row.description,
      whatsappAvailable: row.whatsappEnabled && row.whatsappPhone !== null,
      ratingAverage: ratingAverage(row.ratingSum, row.ratingCount),
      ratingCount: row.ratingCount,
      organization: {
        name: row.organization.name,
        logoKey: row.organization.logoKey,
        city: row.organization.city!,
        state: row.organization.state!,
      },
      services: row.services.map(({ catalogService }) => catalogService),
      reviews: row.professionalReviews,
    };
  }

  async findWhatsappContact(slug: string) {
    const row = await this.prisma.publicBusinessProfile.findFirst({
      where: {
        slug,
        published: true,
        whatsappEnabled: true,
        whatsappPhone: {
          not: null,
        },
        organization: {
          setupCompletedAt: {
            not: null,
          },
          city: {
            not: null,
          },
          state: {
            not: null,
          },
        },
      },
      select: {
        whatsappPhone: true,
        organization: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!row || row.whatsappPhone === null) {
      return null;
    }

    return {
      businessName: row.organization.name,
      phone: row.whatsappPhone,
    };
  }
}
