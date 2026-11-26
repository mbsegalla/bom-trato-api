import PDFDocument from 'pdfkit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WorkOrderDocumentData } from '../../application/types/workOrderDocument.types.js';

import { PdfKitWorkOrderDocumentGenerator } from './pdfKitWorkOrderDocumentGenerator.js';

const now = new Date('2026-01-02T12:00:00Z');
const item: WorkOrderDocumentData['workOrder']['items'][number] = {
  name: 'Fixture service',
  description: 'Fixture description',
  unit: 'SQUARE_METER',
  quantityInThousandths: 2500,
  unitAmountInCents: 4000,
  totalInCents: 10000,
  position: 1,
};

function data(patch: Partial<WorkOrderDocumentData> = {}): WorkOrderDocumentData {
  return {
    organizationName: 'Fixture company',
    workOrder: {
      id: 'order',
      title: 'Fixture order',
      customerName: 'Fixture customer',
      status: 'COMPLETED',
      completedAt: now,
      createdAt: now,
      currency: 'brl',
      subtotalInCents: 10000,
      discountInCents: 0,
      totalInCents: 10000,
      version: 3,
      items: [item],
    },
    warranty: null,
    acceptedBy: null,
    acceptedAt: null,
    ...patch,
  };
}

async function render(value = data()) {
  const spy = vi.spyOn(PDFDocument.prototype, 'text');
  const content = await new PdfKitWorkOrderDocumentGenerator().generate(value);
  const texts = spy.mock.calls.map(([text]) => String(text));
  const pdf = Buffer.from(content).toString('latin1');

  expect(pdf).toMatch(/^%PDF-/);
  expect(pdf.trimEnd()).toMatch(/%%EOF$/);

  return { texts, pdf };
}

describe('PdfKitWorkOrderDocumentGenerator', () => {
  afterEach(() => vi.restoreAllMocks());

  it('generates a report with contracted amounts, explicit payment disclaimer and service details', async () => {
    const { texts } = await render();
    expect(texts).toEqual(
      expect.arrayContaining([
        'Fixture company',
        'Fixture order',
        'Cliente: Fixture customer',
        'Ordem de serviço: order',
        'Status: Concluída',
        '1. Fixture service',
        'Quantidade: 2,5 m²',
        'Fixture description',
        'Este relatório não comprova a quitação de pagamentos.',
        'Documento informativo. Não substitui nota fiscal nem certificado de assinatura digital.',
      ]),
    );
    expect(texts.some((text) => /Total contratado: R\$\s*100,00/.test(text))).toBe(true);
    expect(texts.some((text) => text.startsWith('Concluída em:'))).toBe(true);
  });

  it('omits private reference and customer identity for an anonymized public document', async () => {
    const value = data();
    const { texts } = await render({
      ...value,
      workOrder: { ...value.workOrder, id: null, customerName: null, completedAt: null, status: 'OPEN' },
    });
    expect(
      texts.some(
        (text) =>
          text.startsWith('Ordem de serviço:') || text.startsWith('Cliente:') || text.startsWith('Concluída em:'),
      ),
    ).toBe(false);
    expect(texts).toContain('Status: Aberta');
  });

  it('does not invent a warranty or completion acceptance', async () => {
    const { texts } = await render();
    expect(texts).toContain('Nenhuma garantia comercial adicional foi informada neste documento.');
    expect(texts).toContain('Não há aceite digital registrado para esta conclusão.');
  });

  it('renders a warranty that starts upon completion without inventing an expiration date', async () => {
    const { texts } = await render(
      data({ warranty: { durationDays: 90, terms: 'Fixture warranty terms', expiresAt: null } }),
    );
    expect(texts).toEqual(
      expect.arrayContaining([
        'Prazo informado: 90 dias corridos.',
        'Início previsto na conclusão da ordem de serviço.',
        'Fixture warranty terms',
        'As condições acima são declaradas pela empresa e não afastam direitos legais aplicáveis.',
      ]),
    );
    expect(texts.some((text) => text.startsWith('Referência de término:'))).toBe(false);
  });

  it('renders a persisted warranty expiration and digital acceptance identity', async () => {
    const { texts } = await render(
      data({
        warranty: { durationDays: 30, terms: 'Fixture warranty terms', expiresAt: new Date('2026-02-01T12:00:00Z') },
        acceptedBy: 'Fixture accepter',
        acceptedAt: now,
      }),
    );
    expect(texts).toContain('Nome informado: Fixture accepter');
    expect(texts.some((text) => text.startsWith('Referência de término:'))).toBe(true);
    expect(texts.some((text) => text.startsWith('Data do aceite:'))).toBe(true);
    expect(texts).toContain('O aceite refere-se aos serviços e valores confirmados no registro original.');
  });

  it('does not infer the signer when the accepted name is absent', async () => {
    const { texts } = await render(data({ acceptedAt: now, acceptedBy: null }));
    expect(texts).toContain('Nome informado: Não informado');
  });

  it('sorts services and excludes empty descriptions', async () => {
    const value = data();
    const items = [
      { ...item, name: 'Second', position: 2, description: ' ' },
      { ...item, name: 'First', position: 1, description: null },
    ];
    const { texts } = await render({ ...value, workOrder: { ...value.workOrder, items } });
    expect(texts.indexOf('1. First')).toBeLessThan(texts.indexOf('2. Second'));
    expect(items.map((entry) => entry.position)).toEqual([2, 1]);
    expect(texts).not.toContain(' ');
  });

  it('generates numbered pages for a long service report', async () => {
    const value = data();
    const { texts, pdf } = await render({
      ...value,
      workOrder: {
        ...value.workOrder,
        items: Array.from({ length: 40 }, (_, index) => ({ ...item, position: index })),
      },
    });
    const pages = texts.filter((text) => /^Página \d+ de \d+$/.test(text));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages).toEqual(
      Array.from({ length: pages.length }, (_, index) => 'Página ' + (index + 1) + ' de ' + pages.length),
    );
    expect(texts.filter((text) => text === 'BOM TRATO | RELATÓRIO DE SERVIÇO')).toHaveLength(pages.length);
    expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(pages.length);
  });

  it('rejects invalid currency rather than returning a partial report', async () => {
    const value = data();
    await expect(
      new PdfKitWorkOrderDocumentGenerator().generate({
        ...value,
        workOrder: { ...value.workOrder, currency: 'invalid' },
      }),
    ).rejects.toBeInstanceOf(RangeError);
  });
});
