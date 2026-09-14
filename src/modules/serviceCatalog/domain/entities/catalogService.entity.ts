import { ServiceUnit } from '../../../../generated/prisma/enums.js';
import { CatalogServiceError } from '../errors/catalogService.error.js';

export interface CatalogServiceProps {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  unit: ServiceUnit;
  amountInCents: number;
  currency: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CatalogServiceDetails {
  name: string;
  description?: string | null;
  unit: ServiceUnit;
  amountInCents: number;
}

export class CatalogService {
  private constructor(private props: CatalogServiceProps) {}

  static create(params: CatalogServiceDetails & { id: string; organizationId: string }, now: Date): CatalogService {
    return new CatalogService({
      id: params.id,
      organizationId: params.organizationId,
      ...CatalogService.normalize(params),
      currency: 'brl',
      archivedAt: null,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });
  }

  static restore(state: CatalogServiceProps): CatalogService {
    return new CatalogService(structuredClone(state));
  }

  update(details: Partial<CatalogServiceDetails>, now: Date): void {
    if (this.props.archivedAt !== null) {
      throw new CatalogServiceError('CATALOG_SERVICE_ARCHIVED');
    }

    const values = [details.name, details.description, details.unit, details.amountInCents];

    if (values.every((value) => value === undefined)) {
      throw new CatalogServiceError('EMPTY_CATALOG_SERVICE_UPDATE');
    }

    const normalized = CatalogService.normalize({
      name: details.name === undefined ? this.props.name : details.name,
      description: details.description === undefined ? this.props.description : details.description,
      unit: details.unit === undefined ? this.props.unit : details.unit,
      amountInCents: details.amountInCents === undefined ? this.props.amountInCents : details.amountInCents,
    });

    this.props = {
      ...this.props,
      ...normalized,
      updatedAt: new Date(now),
    };
  }

  archive(now: Date): void {
    if (this.props.archivedAt !== null) {
      return;
    }

    this.props.archivedAt = new Date(now);
    this.props.updatedAt = new Date(now);
  }

  unarchive(now: Date): void {
    if (this.props.archivedAt === null) {
      return;
    }

    this.props.archivedAt = null;
    this.props.updatedAt = new Date(now);
  }

  snapshot(): CatalogServiceProps {
    return structuredClone(this.props);
  }

  private static normalize(details: CatalogServiceDetails) {
    if (typeof details.name !== 'string' || details.name.trim().length < 2 || details.name.trim().length > 100) {
      throw new CatalogServiceError('INVALID_CATALOG_SERVICE_NAME');
    }

    if (
      details.description !== undefined &&
      details.description !== null &&
      (typeof details.description !== 'string' || details.description.trim().length > 2000)
    ) {
      throw new CatalogServiceError('INVALID_CATALOG_SERVICE_DESCRIPTION');
    }

    if (!Object.values(ServiceUnit).includes(details.unit)) {
      throw new CatalogServiceError('INVALID_CATALOG_SERVICE_UNIT');
    }

    if (
      !Number.isSafeInteger(details.amountInCents) ||
      details.amountInCents < 0 ||
      details.amountInCents > 2147483647
    ) {
      throw new CatalogServiceError('INVALID_CATALOG_SERVICE_AMOUNT');
    }

    return {
      name: details.name.trim(),
      description: details.description?.trim() || null,
      unit: details.unit,
      amountInCents: details.amountInCents,
    };
  }
}
