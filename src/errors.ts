export type ChannelErrorCode =
  | 'CHANNEL_NOT_FOUND'
  | 'CHANNEL_UNAVAILABLE'
  | 'BACKEND_UNAVAILABLE'
  | 'BACKEND_OPERATION_FAILED'
  | 'INVALID_ARGUMENT'
  | 'CAPABILITY_UNSUPPORTED'
  | 'PERMISSION_DENIED'
  | 'TIMEOUT'
  | 'AUTHENTICATION_REQUIRED';

export class ChannelError extends Error {
  readonly code: ChannelErrorCode;
  readonly details?: Record<string, string | number | boolean>;

  constructor(
    code: ChannelErrorCode,
    message: string,
    details?: Record<string, string | number | boolean>,
  ) {
    super(message);
    this.name = 'ChannelError';
    this.code = code;
    this.details = details;
  }
}

export interface StructuredError {
  error: {
    code: ChannelErrorCode | 'INTERNAL_ERROR';
    message: string;
    details?: Record<string, string | number | boolean>;
  };
}

export function toStructuredError(error: unknown): StructuredError {
  if (error instanceof ChannelError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    };
  }

  return {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Unexpected internal error',
    },
  };
}
