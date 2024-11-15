import { RangeError } from './range-error';
import { MotorAction } from '../../types/teletask';

/**
 * Validates that a number is within the specified range
 * @throws {RangeError} if value is outside the valid range
 */
export function validateRange(value: number, min: number, max: number, paramName: string): void {
  if (value < min || value > max || !Number.isInteger(value)) {
    throw new RangeError(value, min, max, paramName);
  }
}

/**
 * Validates a central unit number
 * @throws {ValidationError} if central unit number is invalid
 */
export function validateCentralUnit(centralUnit: number): void {
  validateRange(centralUnit, 1, 10, 'Central unit');
}

/**
 * Validates a component number (relay, dimmer, motor, etc.)
 * @throws {ValidationError} if component number is invalid
 */
export function validateComponentNumber(number: number, componentType: string): void {
  validateRange(number, 0, 0xffff, componentType);
}

/**
 * Validates a dimmer level
 * @throws {ValidationError} if level is invalid
 */
export function validateDimmerLevel(level: number): void {
  validateRange(level, 0, 100, 'Dimmer level');
}

/**
 * Validates all parameters for a component command
 * @throws {ValidationError} if any parameter is invalid
 */
export function validateComponentParameters(centralUnit: number, componentNumber: number, componentType: string): void {
  validateCentralUnit(centralUnit);
  validateComponentNumber(componentNumber, componentType);
}

/**
 * Validate motor position
 */
export function validateMotorPosition(position: number): void {
  if (position < 0 || position > 100 || !Number.isInteger(position)) {
    throw new RangeError(position, 0, 100, 'Motor position');
  }
}

/**
 * Validate motor action
 * @param action
 */
export function validateMotorAction(action: MotorAction): void {
  if (!Object.values(MotorAction).includes(action)) {
    throw new Error(`Invalid motor action: ${action}`);
  }
}
