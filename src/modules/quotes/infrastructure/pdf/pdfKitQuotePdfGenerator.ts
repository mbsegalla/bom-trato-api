import PDFDocument from 'pdfkit';

import type { ServiceUnit } from '../../../../generated/prisma/enums.js';
import { QuoteStatus } from '../../../../generated/prisma/enums.js';
import { QuotePdfGenerator } from '../../application/ports/quotePdfGenerator.port.js';
import type { QuotePdfData } from '../../application/types/quotePdf.types.js';

const statusLabels = {
  DRAFT: 'Rascunho',
  SENT: 'Enviado',
  APPROVED: 'Aprovado',
  DECLINED: 'Recusado',
  CANCELED: 'Cancelado',
} satisfies Record<QuoteStatus, string>;

const unitLabels = {
  SERVICE: 'serviço',
  HOUR: 'hora',
  DAY: 'dia',
  UNIT: 'unidade',
  SQUARE_METER: 'm²',
} satisfies Record<ServiceUnit, string>;

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

const quantityFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 3,
});

export class PdfKitQuotePdfGenerator extends QuotePdfGenerator {
  async generate(data: QuotePdfData): Promise<Uint8Array> {
    const doc = new PDFDocument({
      size: 'A4',
      margins: {
        top: 56,
        bottom: 56,
        left: 48,
        right: 48,
      },
      bufferPages: true,
      info: {
        Title: `Orçamento ${data.quote.id}`,
        Author: data.organizationName,
        Creator: 'Bom Trato',
      },
    });

    const result = new Promise<Uint8Array>((resolve, reject) => {
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));

      doc.once('end', () => {
        resolve(Buffer.concat(chunks));
      });

      doc.once('error', reject);
    });

    try {
      new QuotePdfLayout(doc).render(data);

      doc.end();
    } catch (error) {
      doc.destroy(error instanceof Error ? error : new Error('Quote PDF generation failed'));
    }

    return result;
  }
}

class QuotePdfLayout {
  private readonly left = 48;
  private readonly width: number;
  private currentFont = 'Helvetica';
  private currentSize = 10;

  constructor(private readonly doc: PDFKit.PDFDocument) {
    this.width = doc.page.width - this.left * 2;
  }

  render({ organizationName, quote, generatedAt }: QuotePdfData): void {
    const { doc } = this;

    const money = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: quote.currency.toUpperCase(),
    });

    const amount = (cents: number): string => money.format(cents / 100);

    doc.on('pageAdded', () => this.pageHeader());

    this.pageHeader();

    this.text(organizationName, 18, true);
    this.text('ORÇAMENTO', 11, true);
    this.text(quote.title, 16, true);
    this.text(`Referência: ${quote.id}`, 9);

    this.text(`Versão: ${quote.version} | Status: ${statusLabels[quote.status]}`, 10, true);

    this.text(`Criado em: ${dateFormatter.format(quote.createdAt)}`, 9);

    this.text(`Validade: ${quote.validUntil === null ? 'Não informada' : dateFormatter.format(quote.validUntil)}`, 9);

    if (quote.status === QuoteStatus.DRAFT) {
      this.text('RASCUNHO - orçamento em elaboração.', 10, true);
    } else if (quote.status === QuoteStatus.SENT && quote.validUntil !== null && quote.validUntil <= generatedAt) {
      this.text('Validade encerrada. Consulte a empresa antes de aprovar.', 10, true);
    }

    this.section('Cliente');

    this.text(quote.customerName, 11, true);

    if (quote.customerEmail !== null) {
      this.text(`E-mail: ${quote.customerEmail}`);
    }

    if (quote.customerPhone !== null) {
      this.text(`Telefone: ${quote.customerPhone}`);
    }

    this.section('Serviços');

    if (quote.items.length === 0) {
      this.text('Nenhum serviço adicionado.');
    }

    const items = [...quote.items].sort((a, b) => a.position - b.position);

    for (const [index, item] of items.entries()) {
      this.ensureSpace(100);

      this.text(`${index + 1}. ${item.name}`, 11, true);
      this.text(
        `Quantidade: ${quantityFormatter.format(item.quantityInThousandths / 1000)} (${unitLabels[item.unit]})`,
        10,
      );
      this.text(`Valor unitário: ${amount(item.unitAmountInCents)} | Total: ${amount(item.totalInCents)}`, 10);

      if (item.description !== null && item.description.trim() !== '') {
        this.text(item.description, 10);
      }

      doc.y += 10;
    }

    this.ensureSpace(130);

    this.section('Valores');

    this.totalLine('Subtotal', amount(quote.subtotalInCents));
    this.totalLine('Desconto', amount(quote.discountInCents));
    this.totalLine('Total', amount(quote.totalInCents), true);

    if (quote.notes !== null && quote.notes.trim() !== '') {
      this.section('Observações');
      this.text(quote.notes);
    }

    this.section('Informações do documento');

    this.text(`Gerado em: ${dateFormatter.format(generatedAt)}. Horários: America/Sao_Paulo.`, 8);
    this.text('Os valores e dados do cliente correspondem à versão do orçamento indicada neste documento.', 8);

    this.footers();
  }

  private pageHeader(): void {
    const { doc } = this;

    doc.font('Helvetica').fontSize(8).fillColor('#64748B');

    doc.text('BOM TRATO | ORÇAMENTO', this.left, 25, { lineBreak: false });

    doc
      .moveTo(this.left, 42)
      .lineTo(this.left + this.width, 42)
      .strokeColor('#CBD5E1')
      .stroke();

    doc.font(this.currentFont).fontSize(this.currentSize).fillColor('#0F172A');

    doc.x = this.left;
    doc.y = 56;
  }

  private text(value: string, size = 10, bold = false): void {
    this.currentFont = bold ? 'Helvetica-Bold' : 'Helvetica';
    this.currentSize = size;

    this.doc.font(this.currentFont).fontSize(size).fillColor('#0F172A');

    this.doc.text(value, this.left, this.doc.y, {
      width: this.width,
      lineGap: 3,
    });

    this.doc.y += 5;
  }

  private section(title: string): void {
    this.ensureSpace(65);

    this.doc.y += 10;

    this.text(title, 12, true);
  }

  private totalLine(label: string, value: string, bold = false): void {
    const { doc } = this;
    const y = doc.y;

    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 14 : 11);

    doc.text(label, this.left, y, {
      width: this.width / 2,
    });

    doc.text(value, this.left + this.width / 2, y, {
      width: this.width / 2,
      align: 'right',
    });

    doc.y = y + (bold ? 30 : 24);
  }

  private ensureSpace(height: number): void {
    const availableBottom = this.doc.page.height - this.doc.page.margins.bottom;

    if (this.doc.y + height > availableBottom) {
      this.doc.addPage();
    }
  }

  private footers(): void {
    const { doc } = this;
    const range = doc.bufferedPageRange();

    for (let index = range.start; index < range.start + range.count; index++) {
      doc.switchToPage(index);

      doc.font('Helvetica').fontSize(8).fillColor('#64748B');

      doc.text(`Página ${index + 1} de ${range.count}`, this.left, doc.page.height - 35, { lineBreak: false });
    }
  }
}
