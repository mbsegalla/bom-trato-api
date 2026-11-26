import PDFDocument from 'pdfkit';

import type { ServiceUnit, WorkOrderStatus } from '../../../../generated/prisma/enums.js';
import { WorkOrderDocumentPdfGenerator } from '../../application/ports/workOrderDocumentPdfGenerator.port.js';
import type { WorkOrderDocumentData } from '../../application/types/workOrderDocument.types.js';

const statusLabels = {
  OPEN: 'Aberta',
  SCHEDULED: 'Agendada',
  IN_PROGRESS: 'Em execução',
  COMPLETED: 'Concluída',
  CANCELED: 'Cancelada',
} satisfies Record<WorkOrderStatus, string>;

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

export class PdfKitWorkOrderDocumentGenerator extends WorkOrderDocumentPdfGenerator {
  async generate(data: WorkOrderDocumentData): Promise<Uint8Array> {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 56, bottom: 56, left: 48, right: 48 },
      bufferPages: true,
      info: {
        Title:
          data.workOrder.id === null
            ? 'Relatório do atendimento'
            : `Relatório da ordem de serviço ${data.workOrder.id}`,
        Author: data.organizationName,
        Creator: 'Bom Trato',
      },
    });

    const result = new Promise<Uint8Array>((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.once('end', () => resolve(Buffer.concat(chunks)));
      doc.once('error', reject);
    });

    try {
      new WorkOrderReportLayout(doc).render(data);
      doc.end();
    } catch (error) {
      doc.destroy(error instanceof Error ? error : new Error('Work order PDF generation failed'));
    }

    return result;
  }
}

class WorkOrderReportLayout {
  private readonly left = 48;
  private readonly width: number;

  constructor(private readonly doc: PDFKit.PDFDocument) {
    this.width = this.doc.page.width - this.left * 2;
  }

  render(data: WorkOrderDocumentData): void {
    const { workOrder, warranty } = data;
    const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: workOrder.currency.toUpperCase() });
    const amount = (cents: number): string => money.format(cents / 100);

    this.doc.on('pageAdded', () => this.header());
    this.header();

    this.text(data.organizationName, 18, true);
    this.text('RELATÓRIO DE SERVIÇO', 12, true);
    this.text(workOrder.title, 16, true);
    if (workOrder.id !== null) {
      this.text(`Ordem de serviço: ${workOrder.id}`, 9);
    }

    if (workOrder.customerName !== null) {
      this.text(`Cliente: ${workOrder.customerName}`, 10);
    }
    this.text(`Status: ${statusLabels[workOrder.status]}`, 10);
    this.text(`Criada em: ${dateFormatter.format(workOrder.createdAt)}`, 9);

    if (workOrder.completedAt !== null) {
      this.text(`Concluída em: ${dateFormatter.format(workOrder.completedAt)}`, 9);
    }

    this.section('Serviços executados ou contratados');

    for (const [index, item] of [...workOrder.items].sort((a, b) => a.position - b.position).entries()) {
      this.ensureSpace(95);
      this.text(`${index + 1}. ${item.name}`, 11, true);
      this.text(
        `Quantidade: ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(item.quantityInThousandths / 1000)} ${unitLabels[item.unit]}`,
      );
      this.text(`Unitário: ${amount(item.unitAmountInCents)} | Total: ${amount(item.totalInCents)}`);

      if (item.description !== null && item.description.trim() !== '') {
        this.text(item.description);
      }

      this.doc.y += 6;
    }

    this.section('Valores contratados');
    this.text(`Subtotal: ${amount(workOrder.subtotalInCents)}`);
    this.text(`Desconto: ${amount(workOrder.discountInCents)}`);
    this.text(`Total contratado: ${amount(workOrder.totalInCents)}`, 12, true);
    this.text('Este relatório não comprova a quitação de pagamentos.', 8);

    this.section('Garantia comercial informada');
    if (warranty === null) {
      this.text('Nenhuma garantia comercial adicional foi informada neste documento.');
    } else {
      this.text(`Prazo informado: ${warranty.durationDays} dias corridos.`, 10, true);
      this.text(
        warranty.expiresAt === null
          ? 'Início previsto na conclusão da ordem de serviço.'
          : `Referência de término: ${dateFormatter.format(warranty.expiresAt)}.`,
      );
      this.text(warranty.terms);
      this.text('As condições acima são declaradas pela empresa e não afastam direitos legais aplicáveis.', 8);
    }

    this.section('Confirmação da conclusão');
    if (data.acceptedAt === null) {
      this.text('Não há aceite digital registrado para esta conclusão.');
    } else {
      this.text(`Nome informado: ${data.acceptedBy ?? 'Não informado'}`);
      this.text(`Data do aceite: ${dateFormatter.format(data.acceptedAt)}`);
      this.text('O aceite refere-se aos serviços e valores confirmados no registro original.', 8);
    }

    this.section('Informações do documento');
    this.text(`Emitido em: ${dateFormatter.format(new Date())} (America/Sao_Paulo).`, 8);
    this.text('Documento informativo. Não substitui nota fiscal nem certificado de assinatura digital.', 8);
    this.footers();
  }

  private header(): void {
    this.doc.font('Helvetica').fontSize(8).fillColor('#64748B');
    this.doc.text('BOM TRATO | RELATÓRIO DE SERVIÇO', this.left, 25, { lineBreak: false });
    this.doc
      .moveTo(this.left, 42)
      .lineTo(this.left + this.width, 42)
      .strokeColor('#CBD5E1')
      .stroke();
    this.doc.font('Helvetica').fontSize(10).fillColor('#0F172A');
    this.doc.x = this.left;
    this.doc.y = 56;
  }

  private text(value: string, size = 10, bold = false): void {
    this.doc
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(size)
      .fillColor('#0F172A');
    this.doc.text(value, this.left, this.doc.y, { width: this.width, lineGap: 3 });
    this.doc.y += 5;
  }

  private section(title: string): void {
    this.ensureSpace(80);
    this.doc.y += 10;
    this.text(title, 12, true);
  }

  private ensureSpace(height: number): void {
    if (this.doc.y + height > this.doc.page.height - this.doc.page.margins.bottom) {
      this.doc.addPage();
    }
  }

  private footers(): void {
    const range = this.doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index++) {
      this.doc.switchToPage(index);
      this.doc.font('Helvetica').fontSize(8).fillColor('#64748B');
      this.doc.text(`Página ${index + 1} de ${range.count}`, this.left, this.doc.page.height - 35, {
        lineBreak: false,
      });
    }
  }
}
