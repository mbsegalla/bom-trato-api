import PDFDocument from 'pdfkit';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { QuotePdfData } from '../../application/types/quote.types.js';

import { PdfKitQuotePdfGenerator } from './pdfKitQuotePdfGenerator.js';

const now = new Date('2026-01-02T12:00:00Z');
const item: QuotePdfData['quote']['items'][number] = {
  id: 'item',
  catalogServiceId: null,
  name: 'Fixture service',
  description: 'Fixture description',
  unit: 'HOUR',
  quantityInThousandths: 1500,
  unitAmountInCents: 4000,
  totalInCents: 6000,
  position: 1,
};

function data(patch: Partial<QuotePdfData['quote']> = {}): QuotePdfData {
  return {
    organizationName: 'Fixture company',
    generatedAt: now,
    quote: {
      id: 'quote',
      version: 3,
      title: 'Fixture quote',
      status: 'SENT',
      customerName: 'Fixture customer',
      customerEmail: 'fixture@example.invalid',
      customerPhone: '34999999999',
      currency: 'brl',
      subtotalInCents: 6000,
      discountInCents: 1000,
      totalInCents: 5000,
      paymentCondition: 'AFTER_COMPLETION',
      downPaymentPercentage: null,
      createdAt: now,
      validUntil: new Date('2026-02-01T12:00:00Z'),
      notes: 'Fixture notes',
      items: [item],
      ...patch,
    },
  };
}

async function render(patch: Partial<QuotePdfData['quote']> = {}) {
  const spy = vi.spyOn(PDFDocument.prototype, 'text');
  const content = await new PdfKitQuotePdfGenerator().generate(data(patch));
  const texts = spy.mock.calls.map(([value]) => String(value));
  const pdf = Buffer.from(content).toString('latin1');

  expect(pdf).toMatch(/^%PDF-/);
  expect(pdf.trimEnd()).toMatch(/%%EOF$/);

  return { texts, pdf };
}

describe('PdfKitQuotePdfGenerator', () => {
  afterEach(() => vi.restoreAllMocks());

  it('generates a complete PDF with customer, item, version and financial totals', async () => {
    const { texts } = await render();
    expect(texts).toEqual(
      expect.arrayContaining([
        'Fixture company',
        'Fixture quote',
        'Fixture customer',
        'E-mail: fixture@example.invalid',
        'Telefone: 34999999999',
        'Versão: 3 | Status: Enviado',
        '1. Fixture service',
        'Quantidade: 1,5 (hora)',
        'Fixture description',
        'Subtotal',
        'Desconto',
        'Total',
        'Fixture notes',
        'Pagamento integral após a conclusão do serviço.',
      ]),
    );
    expect(texts.some((text) => /R\$\s*50,00/.test(text))).toBe(true);
  });

  it('marks draft quotes and handles absent contact details, items and validity', async () => {
    const { texts } = await render({
      status: 'DRAFT',
      items: [],
      validUntil: null,
      notes: null,
      customerEmail: null,
      customerPhone: null,
    });
    expect(texts).toEqual(
      expect.arrayContaining([
        'RASCUNHO - orçamento em elaboração.',
        'Validade: Não informada',
        'Nenhum serviço adicionado.',
      ]),
    );
    expect(texts.some((text) => text.startsWith('E-mail:') || text.startsWith('Telefone:'))).toBe(false);
    expect(texts).not.toContain('Observações');
  });

  it('warns about a sent quote at the exact validity boundary', async () => {
    const { texts } = await render({ validUntil: now });
    expect(texts).toContain('Validade encerrada. Consulte a empresa antes de aprovar.');
  });

  it.each(['APPROVED', 'DECLINED', 'CANCELED'] as const)(
    'does not add a draft or validity warning for %s',
    async (status) => {
      const { texts } = await render({ status, validUntil: new Date(now.getTime() - 1) });
      expect(texts).not.toContain('Validade encerrada. Consulte a empresa antes de aprovar.');
      expect(texts).not.toContain('RASCUNHO - orçamento em elaboração.');
    },
  );

  it('renders upfront payment conditions', async () => {
    const { texts } = await render({ paymentCondition: 'UPFRONT' });
    expect(texts).toContain('Pagamento integral antecipado.');
  });

  it('calculates the down payment and remaining balance without losing cents', async () => {
    const { texts } = await render({
      paymentCondition: 'DOWN_PAYMENT_AND_BALANCE',
      downPaymentPercentage: 33,
      totalInCents: 10001,
    });
    expect(texts.some((text) => /Entrada de 33%: R\$\s*33,00/.test(text))).toBe(true);
    expect(texts.some((text) => /Saldo restante após a conclusão do serviço: R\$\s*67,01/.test(text))).toBe(true);
  });

  it('renders a missing down payment percentage as zero', async () => {
    const { texts } = await render({ paymentCondition: 'DOWN_PAYMENT_AND_BALANCE', downPaymentPercentage: null });
    expect(texts.some((text) => /Entrada de 0%: R\$\s*0,00/.test(text))).toBe(true);
  });

  it('sorts items by position without modifying the original collection and omits blank descriptions', async () => {
    const items = [
      { ...item, position: 2, name: 'Second service', description: '  ' },
      { ...item, position: 1, name: 'First service', description: null },
    ];
    const { texts } = await render({ items, notes: '  ' });
    expect(texts.indexOf('1. First service')).toBeLessThan(texts.indexOf('2. Second service'));
    expect(items.map((entry) => entry.position)).toEqual([2, 1]);
    expect(texts).not.toContain('Observações');
    expect(texts).not.toContain('  ');
  });

  it('generates multipage documents with repeated headers and sequential footers', async () => {
    const items = Array.from({ length: 35 }, (_, index) => ({ ...item, id: String(index), position: index }));
    const { texts, pdf } = await render({ items });
    const pages = texts.filter((text) => /^Página \d+ de \d+$/.test(text));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages).toEqual(
      Array.from({ length: pages.length }, (_, index) => 'Página ' + (index + 1) + ' de ' + pages.length),
    );
    expect(texts.filter((text) => text === 'BOM TRATO | ORÇAMENTO')).toHaveLength(pages.length);
    expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(pages.length);
  });

  it('rejects invalid document currency instead of returning a partial PDF', async () => {
    await expect(new PdfKitQuotePdfGenerator().generate(data({ currency: 'invalid' }))).rejects.toBeInstanceOf(
      RangeError,
    );
  });
});
