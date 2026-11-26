import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Prisma } from '../../../../generated/prisma/client.js';
import { WorkOrderStatus } from '../../../../generated/prisma/enums.js';
import type { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { ObjectStorage } from '../../../../shared/storage/objectStorage.port.js';
import type { OrganizationAccessContext } from '../../../organizations/domain/policies/organizationAccess.policy.js';
import type { OrganizationPlatformAccess } from '../../../organizations/domain/policies/organizationPlatformAccess.policy.js';
import type {
  AcceptWorkOrderInput,
  WorkOrderAcceptanceProps,
} from '../../domain/entities/workOrderAcceptance.entity.js';
import {
  WORK_ORDER_ACCEPTANCE_CONSENT_TEXT,
  WORK_ORDER_ACCEPTANCE_CONSENT_VERSION,
  WorkOrderAcceptance,
} from '../../domain/entities/workOrderAcceptance.entity.js';
import type { WorkOrderShareProps } from '../../domain/entities/workOrderShare.entity.js';
import { WorkOrderAcceptanceRepository } from '../../domain/repositories/workOrderAcceptance.repository.js';
import { PrismaWorkOrderAcceptanceRepository } from '../../infrastructure/repositories/prismaWorkOrderAcceptance.repository.js';
import { NodeWorkOrderShareSecurity } from '../../infrastructure/security/nodeWorkOrderShareSecurity.js';
import { PrismaPublicWorkOrderUnitOfWork } from '../../infrastructure/transactions/prismaPublicWorkOrderUnitOfWork.js';
import {
  createWorkOrderAcceptanceSnapshot,
  hashWorkOrderAcceptanceSnapshot,
} from '../mappers/workOrderAcceptance.mapper.js';
import type { PublicWorkOrderTransaction, PublicWorkOrderUnitOfWork } from '../ports/publicWorkOrderUnitOfWork.port.js';
import type { WorkOrderAcceptanceUnitOfWork } from '../ports/workOrderAcceptanceUnitOfWork.port.js';
import type { PublicWorkOrderSnapshot } from '../types/publicWorkOrder.types.js';

import { AcceptPublicWorkOrderUseCase } from './acceptPublicWorkOrder.useCase.js';
import { GetPublicWorkOrderUseCase } from './getPublicWorkOrder.useCase.js';
import { GetWorkOrderAcceptanceUseCase } from './getWorkOrderAcceptance.useCase.js';

const now = new Date('2026-11-25T18:00:00.000Z');
const params = {
  organizationId: 'organization',
  workOrderId: 'work-order',
  userId: 'member'
};
const token = 'a'.repeat(64);

class MemoryAcceptances extends WorkOrderAcceptanceRepository {
  records: WorkOrderAcceptanceProps[] = [];

  async findForCompletion(completedAt: Date): Promise<WorkOrderAcceptanceProps | null> {
    return structuredClone(
      this.records.find((record) => record.completedAt.getTime() === completedAt.getTime()) ?? null,
    );
  }

  async create(acceptance: WorkOrderAcceptance): Promise<void> {
    this.records.push(acceptance.snapshot());
  }
}

function setup() {
  const security = new NodeWorkOrderShareSecurity();
  const share: WorkOrderShareProps = {
    id: 'share',
    ...params,
    tokenHash: security.hash(token),
    createdById: params.userId,
    createdAt: new Date('2026-11-25T10:00:00.000Z'),
    expiresAt: new Date('2026-11-26T10:00:00.000Z'),
    revokedAt: null,
  };
  const workOrder: PublicWorkOrderSnapshot = {
    id: params.workOrderId,
    organizationId: params.organizationId,
    version: 4,
    title: 'Manutenção da instalação',
    status: WorkOrderStatus.COMPLETED,
    currency: 'BRL',
    subtotalInCents: 12000,
    discountInCents: 2000,
    totalInCents: 10000,
    scheduledStartAt: null,
    scheduledEndAt: null,
    startedAt: new Date('2026-11-25T14:00:00.000Z'),
    completedAt: new Date('2026-11-25T16:00:00.000Z'),
    canceledAt: null,
    createdAt: new Date('2026-11-25T10:00:00.000Z'),
    assignedToName: 'Técnico Interno',
    organization: { name: 'Oficina Bom Trato', logoKey: 'organization/logo.webp' },
    items: [
      {
        name: 'Instalação',
        description: 'Ajuste e revisão',
        unit: 'SERVICE',
        quantityInThousandths: 1000,
        unitAmountInCents: 12000,
        totalInCents: 12000,
        position: 0,
      },
    ],
    photos: [{
      id: 'photo',
      stage: 'AFTER',
      caption: 'Foto dinâmica',
      width: 800,
      height: 600,
      createdAt: new Date()
    }],
    checklistItems: [{
      id: 'checklist',
      title: 'Tarefa dinâmica',
      completed: true,
      completedAt: new Date()
    }],
    receivables: [],
    timelineSource: { quoteApprovedAt: null, statusHistory: [], scheduleHistory: [] },
  };
  Object.assign(workOrder, {
    customerName: 'Cliente privado',
    executionNotes: 'Notas internas',
    serviceAddress: 'Endereço privado',
  });

  const access: OrganizationPlatformAccess = {
    hasAccess: true,
    source: 'SUBSCRIPTION',
    billingNeedsReconciliation: false,
  };
  const memberAccess: OrganizationAccessContext = {
    isMember: true,
    verified: true,
    hasPlatformAccess: true,
    source: 'SUBSCRIPTION',
    billingNeedsReconciliation: false,
  };
  const acceptances = new MemoryAcceptances();
  const findWorkOrder = vi.fn(async () => structuredClone(workOrder));
  const findPlatformAccess = vi.fn(async () => structuredClone(access));
  const context = (): PublicWorkOrderTransaction => ({
    share: structuredClone(share),
    acceptances,
    findWorkOrder,
    findPlatformAccess,
    findPhoto: async () => null,
  });
  let queue: Promise<void> = Promise.resolve();
  const publicUnitOfWork: PublicWorkOrderUnitOfWork = {
    read: async (_hash, operation) => operation(context()),
    run: (_hash, operation) => {
      const result = queue.then(() => operation(context()));
      queue = result.then(
        () => undefined,
        () => undefined,
      );

      return result;
    },
  };
  const privateUnitOfWork: WorkOrderAcceptanceUnitOfWork = {
    read: async (actor, operation) =>
      operation({
        access: { ...memberAccess, isMember: memberAccess.isMember && actor.organizationId === params.organizationId },
        acceptances,
        findWorkOrder: async () => (actor.workOrderId === params.workOrderId ? structuredClone(workOrder) : null),
      }),
  };
  const storage: ObjectStorage = {
    put: async () => undefined,
    delete: async () => undefined,
    publicUrl: () => 'https://example.com/logo',
  };
  const input: AcceptWorkOrderInput = {
    snapshotHash: hashWorkOrderAcceptanceSnapshot(createWorkOrderAcceptanceSnapshot(workOrder)),
    signerName: '  Maria  da\nSilva  ',
    consent: true,
    consentVersion: WORK_ORDER_ACCEPTANCE_CONSENT_VERSION,
  };

  return {
    share,
    workOrder,
    access,
    memberAccess,
    acceptances,
    findWorkOrder,
    findPlatformAccess,
    input,
    accept: new AcceptPublicWorkOrderUseCase(publicUnitOfWork, security),
    resolve: new GetPublicWorkOrderUseCase(publicUnitOfWork, security, storage),
    internal: new GetWorkOrderAcceptanceUseCase(privateUnitOfWork),
  };
}

beforeEach(() => vi.useFakeTimers({ now }));

afterEach(() => vi.useRealTimers());

describe('work order completion acceptance', () => {
  it('records the server snapshot and consent once without changing the completed work order', async () => {
    const fixture = setup();
    const previous = structuredClone(fixture.workOrder);

    const result = await fixture.accept.execute(token, fixture.input);

    expect(result).toEqual({ acceptedAt: now, completedAt: fixture.workOrder.completedAt });
    expect(Object.keys(result).sort()).toEqual(['acceptedAt', 'completedAt']);
    expect(fixture.workOrder).toEqual(previous);
    expect(fixture.acceptances.records).toHaveLength(1);
    expect(fixture.acceptances.records[0]).toMatchObject({
      shareId: fixture.share.id,
      signerName: 'Maria da Silva',
      workOrderVersion: 4,
      consentVersion: '1',
      consentText: WORK_ORDER_ACCEPTANCE_CONSENT_TEXT,
      snapshotHash: fixture.input.snapshotHash,
      snapshot: {
        schemaVersion: 1,
        organizationName: 'Oficina Bom Trato',
        workOrder: { version: 4, completedAt: '2026-11-25T16:00:00.000Z' },
      },
    });

    const serialized = JSON.stringify(fixture.acceptances.records[0]);
    for (const excluded of [
      'Cliente privado',
      'Notas internas',
      'Endereço privado',
      'Tarefa dinâmica',
      'Foto dinâmica',
      'Técnico Interno',
      token,
      fixture.share.tokenHash,
    ]) {
      expect(serialized).not.toContain(excluded);
    }
  });

  it('offers only the current snapshot and hides the supplied name from the public receipt', async () => {
    const fixture = setup();

    await expect(fixture.resolve.execute(token)).resolves.toMatchObject({
      acceptance: {
        canAccept: true,
        snapshotHash: fixture.input.snapshotHash,
        consentVersion: '1',
        consentText: WORK_ORDER_ACCEPTANCE_CONSENT_TEXT,
        receipt: null,
      },
    });

    await fixture.accept.execute(token, fixture.input);
    fixture.access.hasAccess = false;
    fixture.access.billingNeedsReconciliation = true;

    const result = await fixture.resolve.execute(token);

    expect(result.acceptance).toEqual({
      canAccept: false,
      snapshotHash: null,
      consentVersion: '1',
      consentText: WORK_ORDER_ACCEPTANCE_CONSENT_TEXT,
      receipt: { acceptedAt: now, completedAt: fixture.workOrder.completedAt },
    });
    expect(JSON.stringify(result)).not.toContain('Maria');
    expect(result.workOrder).not.toHaveProperty('version');
  });

  it('replays the original evidence after plan expiry and organization rename without replacing it', async () => {
    const fixture = setup();

    const first = await fixture.accept.execute(token, fixture.input);
    const recorded = structuredClone(fixture.acceptances.records[0]);
    fixture.access.hasAccess = false;
    fixture.access.billingNeedsReconciliation = true;
    fixture.workOrder.organization.name = 'Nome atualizado';
    fixture.share.id = 'replacement-share';
    vi.setSystemTime(new Date(now.getTime() + 60_000));

    await expect(fixture.accept.execute(token, { ...fixture.input, signerName: 'Maria da Silva' })).resolves.toEqual(
      first,
    );
    expect(fixture.acceptances.records).toEqual([recorded]);
    expect(fixture.findPlatformAccess).toHaveBeenCalledOnce();
    await expect(fixture.internal.execute(params)).resolves.toMatchObject({
      receipt: { signerName: 'Maria da Silva', snapshot: { organizationName: 'Oficina Bom Trato' } },
    });
  });

  it.each([
    { signerName: 'Outro nome' },
    { snapshotHash: 'b'.repeat(64) },
    { consentVersion: '2' }
  ])(
    'does not replace existing evidence for a different replay %j',
    async (change) => {
      const fixture = setup();

      await fixture.accept.execute(token, fixture.input);
      const original = structuredClone(fixture.acceptances.records);

      await expect(fixture.accept.execute(token, { ...fixture.input, ...change })).rejects.toMatchObject({
        code: 'WORK_ORDER_ALREADY_ACCEPTED',
      });
      expect(fixture.acceptances.records).toEqual(original);
    },
  );

  it('serializes simultaneous attempts into one receipt and rejects a different signer', async () => {
    const fixture = setup();

    const results = await Promise.all([
      fixture.accept.execute(token, fixture.input),
      fixture.accept.execute(token, fixture.input),
      fixture.accept.execute(token, { ...fixture.input, signerName: 'Maria da Silva' }),
    ]);

    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
    expect(fixture.acceptances.records).toHaveLength(1);
    await expect(
      fixture.accept.execute(token, { ...fixture.input, signerName: 'Outro cliente' }),
    ).rejects.toMatchObject({ code: 'WORK_ORDER_ALREADY_ACCEPTED' });
  });

  it.each(['OPEN', 'SCHEDULED', 'IN_PROGRESS', 'CANCELED'] as const)(
    'rejects acceptance in %s without recording evidence',
    async (status) => {
      const fixture = setup();
      fixture.workOrder.status = status;

      await expect(fixture.accept.execute(token, fixture.input)).rejects.toMatchObject({
        code: 'WORK_ORDER_ACCEPTANCE_NOT_AVAILABLE',
      });
      await expect(fixture.resolve.execute(token)).resolves.toMatchObject({
        acceptance: { canAccept: false, snapshotHash: null, receipt: null },
      });
      expect(fixture.acceptances.records).toHaveLength(0);
    },
  );

  it('requires a completion timestamp and refuses a receipt from a different work order version', async () => {
    const fixture = setup();

    await fixture.accept.execute(token, fixture.input);
    fixture.workOrder.version += 1;

    await expect(fixture.accept.execute(token, fixture.input)).rejects.toMatchObject({
      code: 'WORK_ORDER_ACCEPTANCE_NOT_AVAILABLE',
    });
    await expect(fixture.resolve.execute(token)).resolves.toMatchObject({
      acceptance: { canAccept: false, receipt: null },
    });
    await expect(fixture.internal.execute(params)).resolves.toEqual({ receipt: null });

    fixture.workOrder.completedAt = null;

    await expect(fixture.accept.execute(token, fixture.input)).rejects.toMatchObject({
      code: 'WORK_ORDER_ACCEPTANCE_NOT_AVAILABLE',
    });
    expect(fixture.acceptances.records).toHaveLength(1);
  });

  it('keeps evidence for an earlier completion instead of treating it as acceptance of a later cycle', async () => {
    const fixture = setup();

    await fixture.accept.execute(token, fixture.input);
    fixture.workOrder.completedAt = new Date('2026-11-25T17:00:00.000Z');
    fixture.workOrder.version += 1;

    const result = await fixture.resolve.execute(token);

    expect(result.acceptance.canAccept).toBe(true);
    expect(result.acceptance.receipt).toBeNull();
    await expect(fixture.accept.execute(token, fixture.input)).rejects.toMatchObject({
      code: 'WORK_ORDER_ACCEPTANCE_SNAPSHOT_CONFLICT',
    });

    await fixture.accept.execute(token, { ...fixture.input, snapshotHash: result.acceptance.snapshotHash! });

    expect(fixture.acceptances.records).toHaveLength(2);
    expect(fixture.acceptances.records[0].workOrderVersion).toBe(4);
  });

  it.each(['title', 'organization', 'items', 'consent', 'hash'] as const)(
    'rejects a stale %s snapshot before recording evidence',
    async (changed) => {
      const fixture = setup();
      if (changed === 'title') {
        fixture.workOrder.title = 'Outro serviço';
      }
      if (changed === 'organization') {
        fixture.workOrder.organization.name = 'Outra organização';
      }
      if (changed === 'items') {
        fixture.workOrder.items[0].quantityInThousandths = 2000;
      }
      if (changed === 'consent') {
        fixture.input.consentVersion = '2';
      }
      if (changed === 'hash') {
        fixture.input.snapshotHash = 'b'.repeat(64);
      }
      await expect(fixture.accept.execute(token, fixture.input)).rejects.toMatchObject({
        code: 'WORK_ORDER_ACCEPTANCE_SNAPSHOT_CONFLICT',
      });

      expect(fixture.acceptances.records).toHaveLength(0);
    },
  );

  it('keeps photos, checklist, current balances and other mutable portal metadata outside the accepted core', async () => {
    const fixture = setup();
    fixture.workOrder.photos = [];
    fixture.workOrder.checklistItems = [];
    fixture.workOrder.assignedToName = 'Outro responsável';
    fixture.workOrder.organization.logoKey = 'new/logo.webp';
    fixture.workOrder.receivables = [
      {
        currency: 'BRL',
        amountInCents: 10000,
        receivedInCents: 5000,
        status: 'PARTIALLY_PAID'
      },
    ];

    await expect(fixture.accept.execute(token, fixture.input)).resolves.toMatchObject({ acceptedAt: now });
    expect(Object.keys(fixture.acceptances.records[0].snapshot).sort()).toEqual([
      'organizationName',
      'schemaVersion',
      'workOrder',
    ]);
  });

  it.each(['expired', 'revoked', 'future', 'other organization', 'other work order'] as const)(
    'rejects a %s share before any initial acceptance or replay',
    async (scenario) => {
      const fixture = setup();

      await fixture.accept.execute(token, fixture.input);
      if (scenario === 'expired') {
        fixture.share.expiresAt = now;
      }
      if (scenario === 'revoked') {
        fixture.share.revokedAt = now;
      }
      if (scenario === 'future') {
        fixture.share.createdAt = new Date(now.getTime() + 1);
      }
      if (scenario === 'other organization') {
        fixture.workOrder.organizationId = 'other-organization';
      }
      if (scenario === 'other work order') {
        fixture.workOrder.id = 'other-work-order';
      }
      await expect(fixture.accept.execute(token, fixture.input)).rejects.toMatchObject({
        code: 'WORK_ORDER_SHARE_NOT_FOUND',
      });

      await expect(fixture.resolve.execute(token)).rejects.toMatchObject({ code: 'WORK_ORDER_SHARE_NOT_FOUND' });
      expect(fixture.acceptances.records).toHaveLength(1);
    },
  );

  it.each(['expired plan', 'billing reconciliation'] as const)(
    'blocks a first acceptance for %s but preserves portal reads',
    async (scenario) => {
      const fixture = setup();
      if (scenario === 'expired plan') {
        fixture.access.hasAccess = false;
      } else {
        fixture.access.billingNeedsReconciliation = true;
      }
      await expect(fixture.accept.execute(token, fixture.input)).rejects.toMatchObject({
        code: scenario === 'expired plan' ? 'SUBSCRIPTION_REQUIRED' : 'BILLING_RECONCILIATION_REQUIRED',
      });

      await expect(fixture.resolve.execute(token)).resolves.toMatchObject({
        acceptance: { canAccept: false, snapshotHash: null },
      });
      expect(fixture.acceptances.records).toHaveLength(0);
    },
  );

  it.each([
    { signerName: '' },
    { signerName: '  ' },
    { signerName: 'A' },
    { signerName: 'x'.repeat(101) },
    { signerName: null },
    { consent: false },
    { consent: 'true' },
    { consentVersion: null },
    { consentVersion: '' },
    { snapshotHash: 'invalid' },
  ])('rejects invalid application inputs %j', async (change) => {
    const fixture = setup();

    await expect(async () =>
      fixture.accept.execute(token, { ...fixture.input, ...change } as AcceptWorkOrderInput),
    ).rejects.toMatchObject({ code: 'INVALID_WORK_ORDER_ACCEPTANCE_INPUT' });
    expect(fixture.acceptances.records).toHaveLength(0);
  });

  it('provides evidence only to verified members of the scoped organization, even without platform access', async () => {
    const fixture = setup();

    await fixture.accept.execute(token, fixture.input);
    fixture.memberAccess.hasPlatformAccess = false;
    fixture.memberAccess.billingNeedsReconciliation = true;

    const result = await fixture.internal.execute(params);

    expect(result.receipt?.signerName).toBe('Maria da Silva');
    expect(result.receipt).not.toHaveProperty('shareId');
    expect(result.receipt).not.toHaveProperty('organizationId');
    await expect(fixture.internal.execute({ ...params, organizationId: 'other' })).rejects.toMatchObject({
      code: 'MEMBER_REQUIRED',
    });
    await expect(fixture.internal.execute({ ...params, workOrderId: 'other' })).rejects.toMatchObject({
      code: 'WORK_ORDER_NOT_FOUND',
    });

    fixture.memberAccess.verified = false;

    await expect(fixture.internal.execute(params)).rejects.toMatchObject({ code: 'VERIFIED_USER_REQUIRED' });

    fixture.memberAccess.isMember = false;

    await expect(fixture.internal.execute(params)).rejects.toMatchObject({ code: 'MEMBER_REQUIRED' });
  });
});

describe('acceptance persistence boundaries', () => {
  it('locks the organization and rereads the token before trusting it, including revocation while waiting', async () => {
    const fixture = setup();
    const events: string[] = [];
    const db = {
      $queryRaw: vi.fn(async (..._args: unknown[]) => {
        events.push('organization lock');
        fixture.share.revokedAt = now;

        return [{ id: params.organizationId }];
      }),
      workOrderShare: {
        findUnique: vi.fn(async () => {
          events.push('token revalidation');

          return structuredClone(fixture.share);
        }),
      },
      workOrder: { findFirst: vi.fn() },
    };
    const prisma = {
      workOrderShare: {
        findUnique: vi.fn(async () => {
          events.push('organization lookup');

          return { organizationId: params.organizationId };
        }),
      },
      $transaction: async <T>(operation: (client: Prisma.TransactionClient) => Promise<T>) =>
        operation(db as unknown as Prisma.TransactionClient),
    } as unknown as PrismaService;
    const useCase = new AcceptPublicWorkOrderUseCase(
      new PrismaPublicWorkOrderUnitOfWork(prisma),
      new NodeWorkOrderShareSecurity(),
    );

    await expect(useCase.execute(token, fixture.input)).rejects.toMatchObject({ code: 'WORK_ORDER_SHARE_NOT_FOUND' });
    expect(events).toEqual(['organization lookup', 'organization lock', 'token revalidation']);
    expect(String(db.$queryRaw.mock.calls[0][0])).toContain('FOR UPDATE');
    expect(db.workOrder.findFirst).not.toHaveBeenCalled();
  });

  it('scopes receipt queries by organization, work order and completion and never stores the raw token', async () => {
    const fixture = setup();

    await fixture.accept.execute(token, fixture.input);
    const recorded = fixture.acceptances.records[0];
    const row = {
      ...recorded,
      consent: true,
      snapshot: recorded.snapshot as unknown as Prisma.JsonValue
    };
    const findFirst = vi.fn<Prisma.TransactionClient['workOrderAcceptance']['findFirst']>().mockResolvedValue(row);
    const create = vi.fn<Prisma.TransactionClient['workOrderAcceptance']['create']>().mockResolvedValue(row);
    const db = { workOrderAcceptance: { findFirst, create } } as unknown as Prisma.TransactionClient;
    const repository = new PrismaWorkOrderAcceptanceRepository(db, params.organizationId, params.workOrderId);

    await repository.findForCompletion(recorded.completedAt);

    expect(findFirst.mock.calls[0][0]?.where).toEqual({
      organizationId: params.organizationId,
      workOrderId: params.workOrderId,
      completedAt: recorded.completedAt,
    });

    await repository.create(WorkOrderAcceptance.restore(recorded));

    expect(create.mock.calls[0][0].data).toMatchObject({
      consent: true,
      signerName: 'Maria da Silva',
      shareId: 'share',
      snapshotHash: fixture.input.snapshotHash,
    });
    expect(JSON.stringify(create.mock.calls)).not.toContain(token);
    await expect(
      repository.create(WorkOrderAcceptance.restore({ ...recorded, organizationId: 'other' })),
    ).rejects.toMatchObject({ code: 'WORK_ORDER_ACCEPTANCE_NOT_AVAILABLE' });
    expect(create).toHaveBeenCalledOnce();
  });
});
