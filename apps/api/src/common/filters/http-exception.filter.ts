import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

const VALIDATION_VI: Array<[RegExp, string]> = [
  [/must be an email/i, 'Email không hợp lệ'],
  [/should not be empty/i, 'Không được để trống'],
  [/must be a string/i, 'Giá trị phải là chuỗi'],
  [/must be a number/i, 'Giá trị phải là số'],
  [/must be a boolean/i, 'Giá trị phải là đúng/sai'],
  [/must be an integer/i, 'Giá trị phải là số nguyên'],
  [/must be a valid enum/i, 'Giá trị không hợp lệ'],
  [/must be a UUID/i, 'Định danh không hợp lệ'],
  [/must be a Date/i, 'Ngày không hợp lệ'],
  [/must match/i, 'Định dạng không hợp lệ'],
  [/must be longer than or equal to/i, 'Giá trị quá ngắn'],
  [/must be shorter than or equal to/i, 'Giá trị quá dài'],
  [/must not be less than/i, 'Giá trị quá nhỏ'],
  [/must not be greater than/i, 'Giá trị quá lớn'],
  [/property .* should not exist/i, 'Trường không được phép'],
  [/Invalid credentials/i, 'Tên đăng nhập hoặc mật khẩu không đúng'],
];

function toVietnameseMessage(raw: string): string {
  for (const [re, vi] of VALIDATION_VI) {
    if (re.test(raw)) return vi;
  }
  return raw;
}

/** Shapes all errors as { success: false, message } so the client can display them. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Đã xảy ra lỗi, vui lòng thử lại';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = toVietnameseMessage(res);
      } else if (res && typeof res === 'object') {
        const m = (res as { message?: string | string[] }).message;
        if (Array.isArray(m)) {
          message = toVietnameseMessage(m[0] ?? message);
        } else if (typeof m === 'string') {
          message = toVietnameseMessage(m);
        }
      }
    } else if (exception instanceof Error) {
      message = toVietnameseMessage(exception.message || message);
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({ success: false, message, statusCode: status });
  }
}
