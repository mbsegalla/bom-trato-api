import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateCustomerDto, UpdateCustomerDto, CustomerPageDto } from '../../../src/modules/customers/presentation/http/dtos/requests/customer.dto.js';
import { CreateCatalogServiceDto, UpdateCatalogServiceDto, CatalogServicePageDto } from '../../../src/modules/serviceCatalog/presentation/http/dtos/requests/catalogService.dto.js';
import { CreateWorkOrderDto, UpdateWorkOrderDto, AssignWorkOrderDto, ScheduleWorkOrderDto, WorkOrderExecutionNotesDto, CancelWorkOrderDto, WorkOrderPageDto } from '../../../src/modules/workOrders/presentation/http/dtos/requests/workOrder.dto.js';
import { UploadWorkOrderPhotoDto, UpdateWorkOrderPhotoDto } from '../../../src/modules/workOrders/presentation/http/dtos/requests/workOrderPhoto.dto.js';

const id = '11111111-1111-4111-8111-111111111111';
const validation = { whitelist: true, forbidNonWhitelisted: true };
const customer = { name: 'Fixture customer', phone: '(34) 99999-9999' };
const service = { name: 'Fixture service', amountInCents: 1000 };

async function valid<T extends object>(dto: new () => T, body: Record<string, unknown>) {
  const value = plainToInstance(dto, body);
  expect(await validate(value, validation)).toEqual([]);
  return value;
}

async function invalid<T extends object>(dto: new () => T, body: Record<string, unknown>, field: string) {
  const errors = await validate(plainToInstance(dto, body), validation);
  expect(errors.map((error) => error.property)).toContain(field);
}

describe('customer DTO validation and normalization', () => {
  it('normalizes contacts and clears nullable fields', async () => {
    expect(await valid(CreateCustomerDto, {
      ...customer, name: ' Fixture customer ', phone: ' (34) 99999-9999 ',
      email: ' fixture@example.com ', notes: ' ', defaultServiceAddress: ' ',
    })).toMatchObject({ ...customer, email: 'fixture@example.com', notes: null, defaultServiceAddress: null });
  });

  it('keeps an omitted update name and allows explicitly null optional contact fields', async () => {
    const result = await valid(UpdateCustomerDto, { phone: customer.phone, email: null, notes: null, defaultServiceAddress: null });
    expect(result.name).toBeUndefined();
    expect(result.email).toBeNull();
    expect(await valid(UpdateCustomerDto, { ...customer, name: ' Updated customer ' })).toMatchObject({ name: 'Updated customer' });
  });

  it.each([
    ['name', null], ['name', 3], ['name', ' '], ['phone', 34], ['phone', 'invalid'],
    ['email', 12], ['email', 'bad'], ['notes', 12], ['notes', 'x'.repeat(5001)],
    ['defaultServiceAddress', 12], ['defaultServiceAddress', 'x'.repeat(501)], ['organizationId', id],
  ])('rejects invalid customer %s', async (field, value) => {
    await invalid(CreateCustomerDto, { ...customer, [field as string]: value }, field as string);
  });

  it('rejects nonstring or null supplied update names', async () => {
    await invalid(UpdateCustomerDto, { phone: customer.phone, name: null }, 'name');
    await invalid(UpdateCustomerDto, { phone: customer.phone, name: 1 }, 'name');
  });

  it('normalizes pagination and filters while preserving the active default', async () => {
    expect(await valid(CustomerPageDto, { page: '2', limit: '5', search: ' Fixture ' }))
      .toMatchObject({ page: 2, limit: 5, search: 'Fixture', status: 'ACTIVE' });
    expect(await valid(CustomerPageDto, {})).toMatchObject({ page: 1, status: 'ACTIVE' });
    for (const value of [null, 12, '', 'x'.repeat(101)]) await invalid(CustomerPageDto, { search: value }, 'search');
  });
});

describe('catalog DTO validation and normalization', () => {
  it('normalizes a free catalog service and defaults the unit', async () => {
    expect(await valid(CreateCatalogServiceDto, { ...service, name: ' Fixture service ', description: ' ', amountInCents: 0 }))
      .toMatchObject({ name: 'Fixture service', description: null, amountInCents: 0, unit: 'SERVICE' });
    expect(await valid(CreateCatalogServiceDto, { ...service, description: ' Fixture description ', estimatedDurationMinutes: null }))
      .toMatchObject({ description: 'Fixture description', estimatedDurationMinutes: null });
  });

  it.each([
    ['name', 1], ['name', ' '], ['description', 1], ['description', 'x'.repeat(2001)],
    ['unit', 'OTHER'], ['amountInCents', -1], ['amountInCents', 1.5],
    ['amountInCents', 2147483648], ['estimatedDurationMinutes', 0], ['estimatedDurationMinutes', 1.5],
    ['estimatedDurationMinutes', 2147483648], ['organizationId', id],
  ])('rejects invalid catalog %s', async (field, value) => {
    await invalid(CreateCatalogServiceDto, { ...service, [field as string]: value }, field as string);
  });

  it('accepts partial updates, zero price and explicit duration removal', async () => {
    expect(await valid(UpdateCatalogServiceDto, {})).toBeInstanceOf(UpdateCatalogServiceDto);
    expect(await valid(UpdateCatalogServiceDto, { name: ' New service ', unit: 'HOUR', amountInCents: 0, estimatedDurationMinutes: null }))
      .toMatchObject({ name: 'New service', unit: 'HOUR', amountInCents: 0, estimatedDurationMinutes: null });
    expect(await valid(UpdateCatalogServiceDto, { estimatedDurationMinutes: 1 })).toMatchObject({ estimatedDurationMinutes: 1 });
  });

  it.each([
    ['name', null], ['name', 1], ['unit', null], ['unit', 'OTHER'], ['amountInCents', null],
    ['amountInCents', -1], ['estimatedDurationMinutes', 0], ['description', 1],
  ])('rejects invalid partial catalog %s', async (field, value) => {
    await invalid(UpdateCatalogServiceDto, { [field as string]: value }, field as string);
  });

  it('normalizes the catalog search and rejects malformed filters', async () => {
    expect(await valid(CatalogServicePageDto, { search: ' service ', limit: '5' }))
      .toMatchObject({ search: 'service', limit: 5, status: 'ACTIVE' });
    expect(await valid(CatalogServicePageDto, {})).toMatchObject({ status: 'ACTIVE' });
    for (const value of [null, 12, '', 'x'.repeat(101)]) await invalid(CatalogServicePageDto, { search: value }, 'search');
  });
});

describe('work order DTO validation and normalization', () => {
  it('accepts only a valid quote UUID for creation', async () => {
    expect(await valid(CreateWorkOrderDto, { quoteId: id })).toMatchObject({ quoteId: id });
    await invalid(CreateWorkOrderDto, { quoteId: 'invalid' }, 'quoteId');
  });

  it('normalizes title and preserves explicit nullable planning fields', async () => {
    expect(await valid(UpdateWorkOrderDto, { version: 1 })).toMatchObject({ version: 1 });
    expect(await valid(UpdateWorkOrderDto, { version: 1, title: ' Fixture order ', instructions: null, serviceAddress: null }))
      .toMatchObject({ title: 'Fixture order', instructions: null, serviceAddress: null });
    expect(await valid(UpdateWorkOrderDto, { version: 1, instructions: 'Fixture', serviceAddress: 'Street' }))
      .toMatchObject({ instructions: 'Fixture', serviceAddress: 'Street' });
  });

  it.each([
    ['version', 0], ['version', '1'], ['version', 2147483648], ['title', null], ['title', 1], ['title', ' '],
    ['instructions', 1], ['instructions', 'x'.repeat(5001)], ['serviceAddress', 1], ['serviceAddress', 'x'.repeat(501)],
  ])('rejects invalid work order planning %s', async (field, value) => {
    await invalid(UpdateWorkOrderDto, { version: 1, [field as string]: value }, field as string);
  });

  it('distinguishes explicitly removing an assignment from omitting its required field', async () => {
    expect(await valid(AssignWorkOrderDto, { version: 1, assignedToId: null })).toMatchObject({ assignedToId: null });
    expect(await valid(AssignWorkOrderDto, { version: 1, assignedToId: id })).toMatchObject({ assignedToId: id });
    await invalid(AssignWorkOrderDto, { version: 1 }, 'assignedToId');
    await invalid(AssignWorkOrderDto, { version: 1, assignedToId: 'invalid' }, 'assignedToId');
  });

  it('requires explicitly present nullable execution notes', async () => {
    expect(await valid(WorkOrderExecutionNotesDto, { version: 1, executionNotes: null })).toMatchObject({ executionNotes: null });
    expect(await valid(WorkOrderExecutionNotesDto, { version: 1, executionNotes: 'Fixture' })).toMatchObject({ executionNotes: 'Fixture' });
    await invalid(WorkOrderExecutionNotesDto, { version: 1 }, 'executionNotes');
    await invalid(WorkOrderExecutionNotesDto, { version: 1, executionNotes: 12 }, 'executionNotes');
    await invalid(WorkOrderExecutionNotesDto, { version: 1, executionNotes: 'x'.repeat(10001) }, 'executionNotes');
  });

  it('requires explicit timezone offsets in scheduled dates', async () => {
    const dates = { version: 1, scheduledStartAt: '2030-01-01T09:00:00-03:00', scheduledEndAt: '2030-01-01T12:30:00Z' };
    expect(await valid(ScheduleWorkOrderDto, dates)).toMatchObject(dates);
    for (const value of ['2030-01-01', '2030-01-01T09:00:00', 'invalid']) {
      await invalid(ScheduleWorkOrderDto, { ...dates, scheduledStartAt: value }, 'scheduledStartAt');
      await invalid(ScheduleWorkOrderDto, { ...dates, scheduledEndAt: value }, 'scheduledEndAt');
    }
  });

  it('normalizes cancellation reasons and rejects missing or short reasons', async () => {
    expect(await valid(CancelWorkOrderDto, { version: 1, reason: ' Fixture reason ' })).toMatchObject({ reason: 'Fixture reason' });
    for (const value of [null, 1, ' ', 'x'.repeat(1001)]) await invalid(CancelWorkOrderDto, { version: 1, reason: value }, 'reason');
  });

  it('accepts optional schedule and identity filters and rejects invalid supplied values', async () => {
    const filters = { status: 'SCHEDULED', customerId: id, assignedToId: id, scheduledFrom: '2030-01-01T00:00:00Z', scheduledTo: '2030-02-01T00:00:00Z' };
    expect(await valid(WorkOrderPageDto, filters)).toMatchObject(filters);
    expect(await valid(WorkOrderPageDto, {})).toMatchObject({ page: 1 });
    for (const field of Object.keys(filters)) {
      await invalid(WorkOrderPageDto, { [field]: 'invalid' }, field);
      await invalid(WorkOrderPageDto, { [field]: null }, field);
    }
  });

  it('normalizes photo captions and preserves explicit false visibility', async () => {
    expect(await valid(UploadWorkOrderPhotoDto, { stage: 'BEFORE', caption: ' Fixture ' })).toMatchObject({ caption: 'Fixture' });
    expect(await valid(UploadWorkOrderPhotoDto, { stage: 'AFTER' })).toMatchObject({ stage: 'AFTER' });
    expect(await valid(UpdateWorkOrderPhotoDto, { version: 1, stage: 'AFTER', caption: null, visibleInPortal: false }))
      .toMatchObject({ stage: 'AFTER', caption: null, visibleInPortal: false });
    expect(await valid(UpdateWorkOrderPhotoDto, { version: 1 })).toMatchObject({ version: 1 });
    expect(await valid(UpdateWorkOrderPhotoDto, { version: 1, caption: ' Fixture ' })).toMatchObject({ caption: 'Fixture' });
  });

  it.each([
    ['stage', null], ['stage', 'OTHER'], ['caption', 1], ['caption', 'x'.repeat(241)],
    ['visibleInPortal', 'false'], ['visibleInPortal', null], ['objectKey', 'private'],
  ])('rejects invalid photo update %s', async (field, value) => {
    await invalid(UpdateWorkOrderPhotoDto, { version: 1, [field as string]: value }, field as string);
  });

  it('rejects invalid upload caption types and excessive lengths', async () => {
    await invalid(UploadWorkOrderPhotoDto, { stage: 'BEFORE', caption: 1 }, 'caption');
    await invalid(UploadWorkOrderPhotoDto, { stage: 'BEFORE', caption: 'x'.repeat(241) }, 'caption');
    expect(await valid(UploadWorkOrderPhotoDto, { stage: 'BEFORE', caption: null })).toMatchObject({ caption: null });
  });
});
