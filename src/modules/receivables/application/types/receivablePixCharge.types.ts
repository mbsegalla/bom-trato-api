export interface ReceivablePixCharge {
  organizationId: string;
  receivableId: string;
  receivableVersion: number;
  receivingSettingsVersion: number;
  amountInCents: number;
  currency: 'brl';
  merchantName: string;
  txid: string;
  copyAndPaste: string;
}
