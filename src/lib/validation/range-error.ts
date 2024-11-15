import { ValidationError } from './validation-error';

export class RangeError extends ValidationError {
  constructor(
    public readonly value: number,
    public readonly min: number,
    public readonly max: number,
    public readonly paramName: string
  ) {
    super(`${paramName} must be between ${min} and ${max}, got ${value}`);
    this.name = 'RangeError';
  }
}
