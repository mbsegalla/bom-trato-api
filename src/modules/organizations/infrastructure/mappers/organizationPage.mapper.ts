import type { OrganizationPage, OrganizationPageParams } from '../../domain/types/organizationPagination.types.js';

export function toOrganizationPage<T>(rows: T[], params: OrganizationPageParams): OrganizationPage<T> {
  return {
    items: rows.slice(0, params.limit),
    page: params.page,
    hasMore: rows.length > params.limit,
  };
}
