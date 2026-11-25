import { WorkOrderChecklistError } from '../errors/workOrderChecklist.error.js';

export const WORK_ORDER_CHECKLIST_LIMIT = 50;
export const WORK_ORDER_CHECKLIST_MAX_TITLE_LENGTH = 200;

export interface WorkOrderChecklistItemProps {
  id: string;
  organizationId: string;
  workOrderId: string;
  title: string;
  position: number;
  completed: boolean;
  completedAt: Date | null;
  completedById: string | null;
  visibleInPortal: boolean;
  version: number;
  createdById: string;
  updatedById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWorkOrderChecklistItemInput {
  title: string;
}

export interface UpdateWorkOrderChecklistItemInput {
  title?: string;
  completed?: boolean;
  visibleInPortal?: boolean;
}

export class WorkOrderChecklistItem {
  private constructor(private readonly props: WorkOrderChecklistItemProps) {}

  static create(
    params: Pick<
      WorkOrderChecklistItemProps,
      'id' | 'organizationId' | 'workOrderId' | 'title' | 'position' | 'createdById'
    >,
    now: Date,
  ): WorkOrderChecklistItem {
    this.assertPosition(params.position);

    return new WorkOrderChecklistItem({
      ...params,
      title: this.normalizeTitle(params.title),
      completed: false,
      completedAt: null,
      completedById: null,
      visibleInPortal: false,
      version: 1,
      updatedById: params.createdById,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });
  }

  static restore(props: WorkOrderChecklistItemProps): WorkOrderChecklistItem {
    return new WorkOrderChecklistItem(structuredClone(props));
  }

  static assertCapacity(count: number): void {
    if (count >= WORK_ORDER_CHECKLIST_LIMIT) {
      throw new WorkOrderChecklistError('WORK_ORDER_CHECKLIST_LIMIT_REACHED');
    }
  }

  static normalizeTitle(title: string): string {
    if (typeof title !== 'string') {
      throw new WorkOrderChecklistError('INVALID_WORK_ORDER_CHECKLIST_INPUT');
    }

    const normalized = title.trim();

    if (normalized.length === 0 || normalized.length > WORK_ORDER_CHECKLIST_MAX_TITLE_LENGTH) {
      throw new WorkOrderChecklistError('INVALID_WORK_ORDER_CHECKLIST_INPUT');
    }

    return normalized;
  }

  private static assertPosition(position: number): void {
    if (!Number.isInteger(position) || position < 0 || position > 2147483647) {
      throw new WorkOrderChecklistError('INVALID_WORK_ORDER_CHECKLIST_INPUT');
    }
  }

  assertVersion(version: number): void {
    if (version !== this.props.version) {
      throw new WorkOrderChecklistError('WORK_ORDER_CHECKLIST_VERSION_CONFLICT');
    }
  }

  update(version: number, input: UpdateWorkOrderChecklistItemInput, userId: string, now: Date): void {
    this.assertVersion(version);
    this.assertCanIncrementVersion();

    if (
      (input.title === undefined && input.completed === undefined && input.visibleInPortal === undefined) ||
      (input.completed !== undefined && typeof input.completed !== 'boolean') ||
      (input.visibleInPortal !== undefined && typeof input.visibleInPortal !== 'boolean')
    ) {
      throw new WorkOrderChecklistError('INVALID_WORK_ORDER_CHECKLIST_INPUT');
    }

    const title = input.title === undefined ? this.props.title : WorkOrderChecklistItem.normalizeTitle(input.title);
    const titleChanged = title !== this.props.title;

    if (titleChanged && input.completed === true) {
      throw new WorkOrderChecklistError('INVALID_WORK_ORDER_CHECKLIST_INPUT');
    }

    const completed = titleChanged ? false : (input.completed ?? this.props.completed);

    if (completed && !this.props.completed) {
      this.props.completedAt = new Date(now);
      this.props.completedById = userId;
    } else if (!completed) {
      this.props.completedAt = null;
      this.props.completedById = null;
    }

    this.props.title = title;
    this.props.completed = completed;
    this.props.visibleInPortal = input.visibleInPortal ?? this.props.visibleInPortal;
    this.recordChange(userId, now);
  }

  move(version: number, position: number, userId: string, now: Date): void {
    this.assertVersion(version);
    WorkOrderChecklistItem.assertPosition(position);

    if (position === this.props.position) {
      return;
    }

    this.assertCanIncrementVersion();
    this.props.position = position;
    this.recordChange(userId, now);
  }

  snapshot(): WorkOrderChecklistItemProps {
    return structuredClone(this.props);
  }

  private assertCanIncrementVersion(): void {
    if (this.props.version >= 2147483647) {
      throw new WorkOrderChecklistError('WORK_ORDER_CHECKLIST_VERSION_CONFLICT');
    }
  }

  private recordChange(userId: string, now: Date): void {
    this.props.version += 1;
    this.props.updatedById = userId;
    this.props.updatedAt = new Date(now);
  }
}
