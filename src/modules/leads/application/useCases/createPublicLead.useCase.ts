import { randomUUID } from 'node:crypto';

import type { LeadDetails } from '../../domain/entities/lead.entity.js';
import { Lead } from '../../domain/entities/lead.entity.js';
import { LeadError } from '../../domain/errors/lead.error.js';
import type { LeadUnitOfWork } from '../ports/leadUnitOfWork.port.js';

export interface CreatePublicLeadInput extends LeadDetails {
  requestKey: string;
  catalogServiceId?: string | null;
}

export class CreatePublicLeadUseCase {
  constructor(private readonly unitOfWork: LeadUnitOfWork) {}

  execute(slug: string, input: CreatePublicLeadInput) {
    return this.unitOfWork.publicRun(slug, async (tx) => {
      const service = input.catalogServiceId ? await tx.findPublicCatalogService(input.catalogServiceId) : null;

      if (input.catalogServiceId && service === null) {
        throw new LeadError('PUBLIC_SERVICE_NOT_FOUND');
      }

      const lead = Lead.create(
        {
          id: randomUUID(),
          requestKey: input.requestKey,
          organizationId: tx.organizationId,
          publicBusinessProfileId: tx.publicBusinessProfileId,
          catalogServiceId: service?.id ?? null,
          requestedServiceName: service?.name ?? null,
          name: input.name,
          email: input.email,
          phone: input.phone,
          message: input.message,
        },
        new Date(),
      );

      const result = await tx.leads.create(lead);

      if (result.created) {
        const state = result.lead;
        const serviceDescription = state.requestedServiceName ? ` sobre ${state.requestedServiceName}` : '';

        for (const userId of tx.recipientUserIds) {
          await tx.notifications.enqueue({
            key: `lead-received/${state.id}/${userId}`,
            userId,
            organizationId: tx.organizationId,
            type: 'LEAD_RECEIVED',
            title: 'Nova solicitação de orçamento',
            message: `${state.name} enviou uma nova solicitação${serviceDescription}.`,
            href: `/leads/${state.id}`,
          });
        }
      }

      return {
        id: result.lead.id,
        createdAt: result.lead.createdAt,
      };
    });
  }
}
