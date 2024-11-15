import { GetResponse } from './get-response';

export enum MotorDirection {
  UP = 0x01,
  DOWN = 0x02,
  STOPPED = 0x03
}

export enum MotorProtectionState {
  NOT_DEFINED = 0x00,
  ON_CONTROLLED = 0x01,
  ON_NOT_CONTROLLED = 0x02,
  ON_OVERRULED = 0x03,
  OFF = 0x04
}

export type MotorState = {
  /**
   * Whether motor is currently moving
   */
  moving: boolean;

  /**
   * Current direction
   */
  direction: 'up' | 'down' | 'stopped';

  /**
   * Current position (0-100)
   */
  position: number;

  /**
   * Target position when moving (0-100)
   */
  targetPosition: number;

  protection: {
    state: keyof typeof MotorProtectionState;
    controlled: boolean;
  };

  /**
   * Time remaining to reach target (seconds)
   */
  timeToFinishSeconds: number;

  calibration: {
    correctionAtZeroPercent: number;
    correctionAtHundredPercent: number;
  };
};

/**
 * Parse a motor response according to TDS protocol
 * Format of response payload:
 * Byte 0: Central unit
 * Byte 1: Function type (0x06 for motor)
 * Byte 2-3: Motor number (MSB, LSB)
 * Byte 4: Error state (not used)
 * Byte 5: Direction byte
 * Byte 6: Power/State byte (0xFF = moving, 0x00 = stopped)
 * Byte 7: Protection byte
 * Byte 8: Position percentage
 * Byte 9: Current position
 * Byte 10-11: Time to finish (centiseconds, MSB, LSB)
 * Byte 12: Correction at 0%
 * Byte 13: Correction at 100%
 */
export function parseMotorResponse(response: GetResponse): MotorState {
  if (!response?.payload || response.payload.length < 14) {
    throw new Error('Invalid motor response: insufficient data');
  }

  const direction = response.payload[5];
  const power = response.payload[6];
  const protection = response.payload[7];
  const position = response.payload[8];
  const currentPosition = response.payload[9];
  const timeToFinish = (response.payload[10] << 8) | response.payload[11];
  const correctionZero = response.payload[12];
  const correctionHundred = response.payload[13];

  // Validate position values
  if (position > 100 || currentPosition > 100) {
    throw new Error(`Invalid motor position values: target=${position}, current=${currentPosition}`);
  }

  // Parse direction
  let directionState: 'up' | 'down' | 'stopped';
  switch (direction) {
    case MotorDirection.UP:
      directionState = 'up';
      break;
    case MotorDirection.DOWN:
      directionState = 'down';
      break;
    case MotorDirection.STOPPED:
    default:
      directionState = 'stopped';
  }

  // Parse protection state
  const protectionState = MotorProtectionState[MotorProtectionState[protection] as keyof typeof MotorProtectionState];
  if (protectionState === undefined) {
    throw new Error(`Invalid motor protection state: ${protection}`);
  }

  return {
    moving: power === 0xff,
    direction: directionState,
    position: currentPosition,
    targetPosition: position,
    protection: {
      state: MotorProtectionState[protectionState] as keyof typeof MotorProtectionState,
      controlled: protection === MotorProtectionState.ON_CONTROLLED
    },
    timeToFinishSeconds: timeToFinish / 100, // Convert centiseconds to seconds
    calibration: {
      correctionAtZeroPercent: correctionZero,
      correctionAtHundredPercent: correctionHundred
    }
  };
}
