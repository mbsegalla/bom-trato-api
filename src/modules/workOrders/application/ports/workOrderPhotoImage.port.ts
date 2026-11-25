export interface WorkOrderPhotoUpload {
  buffer: Buffer;
  mimeType: string;
  size: number;
}

export interface ProcessedWorkOrderPhoto {
  buffer: Buffer;
  width: number;
  height: number;
}

export abstract class WorkOrderPhotoImageProcessor {
  abstract process(input: WorkOrderPhotoUpload): Promise<ProcessedWorkOrderPhoto>;
}
