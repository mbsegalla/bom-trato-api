import { randomUUID } from 'node:crypto';

import { Customer } from '../../../customers/domain/entities/customer.entity.js';
import { Quote } from '../../../quotes/domain/entities/quote.entity.js';
import { QuoteItem } from '../../../quotes/domain/entities/quoteItem.entity.js';
import { LeadError } from '../../domain/errors/lead.error.js';
import type { LeadActorParams } from '../ports/leadUnitOfWork.port.js';
import type { LeadApplicationService } from '../services/leadApplicationService.service.js';

export class ConvertLeadUseCase {
  constructor(private readonly processor: LeadApplicationService) {}

  execute(params: LeadActorParams & { leadId: string }) {
    const { leadId, organizationId, userId } = params;

    return this.processor.run(params, async (tx) => {
      const lead = await this.processor.load(tx, leadId);
      const state = lead.snapshot();

      if (state.status === 'CONVERTED' || state.status === 'ARCHIVED') {
        throw new LeadError('INVALID_LEAD_TRANSITION');
      }

      const matchingCustomers = await tx.findCustomersByContact(state.email, state.phone);

      if (matchingCustomers.length > 1) {
        throw new LeadError('LEAD_CUSTOMER_CONFLICT');
      }

      let customer = matchingCustomers[0];

      if (customer?.archivedAt) {
        throw new LeadError('LEAD_CUSTOMER_ARCHIVED');
      }

      if (!customer) {
        const entity = Customer.create(
          {
            id: randomUUID(),
            organizationId,
            name: state.name,
            email: state.email,
            phone: state.phone,
            notes: `Solicitação recebida pela vitrine.\n\n${state.message}`,
          },
          new Date(),
        );

        await tx.customers.create(entity);

        customer = entity.snapshot();
      }

      const quote = Quote.create(
        {
          id: randomUUID(),
          organizationId,
          userId,
          customer,
          details: {
            title: state.requestedServiceName ?? `Solicitação de ${state.name}`,
            notes: state.message,
            validUntil: null,
          },
        },
        new Date(),
      );

      if (state.catalogServiceId !== null) {
        const service = await tx.findCatalogService(state.catalogServiceId);

        if (service !== null && service.archivedAt === null && service.currency === 'brl') {
          quote.addItem(
            QuoteItem.create(
              randomUUID(),
              {
                name: service.name,
                description: service.description,
                unit: service.unit,
                quantity: '1',
                unitAmountInCents: service.amountInCents,
              },
              service.id,
            ),
          );
        }
      }

      await tx.quotes.create(quote);

      const quoteState = quote.snapshot();

      lead.convert(customer.id, quoteState.id, new Date());

      await tx.leads.save(lead);

      return {
        lead: lead.snapshot(),
        customerId: customer.id,
        quoteId: quoteState.id,
      };
    });
  }
}
