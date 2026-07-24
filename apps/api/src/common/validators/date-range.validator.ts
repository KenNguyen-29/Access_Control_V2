import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDateLocal(raw: string): Date | null {
  const text = String(raw ?? '').trim();
  const m = DATE_RE.exec(text);
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const dt = new Date(y, month - 1, day);
  if (dt.getFullYear() !== y || dt.getMonth() !== month - 1 || dt.getDate() !== day) {
    return null;
  }
  return dt;
}

@ValidatorConstraint({ name: 'IsDateOnOrAfter', async: false })
export class IsDateOnOrAfterConstraint implements ValidatorConstraintInterface {
  validate(endDate: unknown, args: ValidationArguments) {
    if (endDate === undefined || endDate === null || endDate === '') return true;
    const [startField] = args.constraints as [string];
    const startDate = (args.object as Record<string, unknown>)[startField];
    // Update payloads may omit startDate — skip range check when absent.
    if (startDate === undefined || startDate === null || startDate === '') return true;
    if (typeof endDate !== 'string' || typeof startDate !== 'string') return false;
    const end = parseIsoDateLocal(endDate);
    const start = parseIsoDateLocal(startDate);
    if (!end || !start) return false;
    return end.getTime() >= start.getTime();
  }

  defaultMessage(args: ValidationArguments) {
    const [startField] = args.constraints as [string];
    return `Ngày kết thúc phải sau hoặc bằng ${startField}`;
  }
}

/** Ensures `property` (end date) is calendar-on-or-after `startField` when both present. */
export function IsDateOnOrAfter(startField: string, validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: {
        message: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu',
        ...validationOptions,
      },
      constraints: [startField],
      validator: IsDateOnOrAfterConstraint,
    });
  };
}
