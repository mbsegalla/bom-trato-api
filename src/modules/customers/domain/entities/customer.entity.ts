import { CustomerError } from '../errors/customer.error.js';

export interface CustomerProps {
  id: string;
  organizationId: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerDetails {
  name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export class Customer {
  private constructor(private state: CustomerProps) {}

  static create(params: CustomerDetails & { id: string; organizationId: string }, now: Date): Customer {
    return new Customer({
      id: params.id,
      organizationId: params.organizationId,
      ...Customer.normalize(params),
      archivedAt: null,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });
  }

  static restore(state: CustomerProps): Customer {
    return new Customer(structuredClone(state));
  }

  update(details: Partial<CustomerDetails>, now: Date): void {
    if (this.state.archivedAt !== null) {
      throw new CustomerError('CUSTOMER_ARCHIVED');
    }

    const values = [details.name, details.email, details.phone, details.notes];

    if (values.every((value) => value === undefined)) {
      throw new CustomerError('EMPTY_CUSTOMER_UPDATE');
    }

    const normalized = Customer.normalize({
      name: details.name === undefined ? this.state.name : details.name,
      email: details.email === undefined ? this.state.email : details.email,
      phone: details.phone === undefined ? this.state.phone : details.phone,
      notes: details.notes === undefined ? this.state.notes : details.notes,
    });

    this.state = {
      ...this.state,
      ...normalized,
      updatedAt: new Date(now),
    };
  }

  archive(now: Date): void {
    if (this.state.archivedAt !== null) {
      return;
    }

    this.state.archivedAt = new Date(now);
    this.state.updatedAt = new Date(now);
  }

  unarchive(now: Date): void {
    if (this.state.archivedAt === null) {
      return;
    }

    this.state.archivedAt = null;
    this.state.updatedAt = new Date(now);
  }

  snapshot(): CustomerProps {
    return structuredClone(this.state);
  }

  private static normalize(details: CustomerDetails) {
    const name = details.name.trim();
    const email = details.email?.trim().toLowerCase() || null;
    const phone = details.phone?.trim() || null;
    const notes = details.notes?.trim() || null;

    if (name.length < 2 || name.length > 100) {
      throw new CustomerError('INVALID_CUSTOMER_NAME');
    }

    if (email !== null && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      throw new CustomerError('INVALID_CUSTOMER_EMAIL');
    }

    if (phone !== null && phone.length > 30) {
      throw new CustomerError('INVALID_CUSTOMER_PHONE');
    }

    if (notes !== null && notes.length > 5000) {
      throw new CustomerError('INVALID_CUSTOMER_NOTES');
    }

    return { name, email, phone, notes };
  }
}
