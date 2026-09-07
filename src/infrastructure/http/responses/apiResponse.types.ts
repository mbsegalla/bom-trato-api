export interface ApiErrorDetail {
  field: string;
  messages: string[];
}

export interface ApiError {
  code: string;
  message: string;
  details: ApiErrorDetail[];
}

export interface ApiSuccessResponse<T> {
  statusCode: number;
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  statusCode: number;
  success: false;
  error: ApiError;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
