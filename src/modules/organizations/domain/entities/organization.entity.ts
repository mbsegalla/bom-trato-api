import { OrganizationError } from '../errors/organization.error.js';

export interface OrganizationProps {
  id: string;
  name: string;
  ownerId: string;
}

export class Organization {
  private constructor(private readonly props: OrganizationProps) {}

  static create(props: OrganizationProps): Organization {
    const name = props.name.trim();

    if (name.length < 2 || name.length > 100) {
      throw new OrganizationError('INVALID_ORGANIZATION_NAME');
    }

    return new Organization({ ...props, name });
  }

  isOwnedBy(userId: string): boolean {
    return this.props.ownerId === userId;
  }

  snapshot(): OrganizationProps {
    return { ...this.props };
  }
}
