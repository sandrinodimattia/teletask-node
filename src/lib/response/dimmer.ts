import { GetResponse } from './get-response';

/**
 * Interface for the dimmer response state
 */
export type DimmerState = {
  /**
   * Whether the dimmer is on or off
   */
  on: boolean;

  /**
   * Dimmer level from 0 to 100
   */
  level: number;

  /**
   * For when dimmer was turned off and has a previous level stored
   */
  previousLevel?: number;
};

/**
 * Parse a dimmer response from the TDS unit. Format of response payload:
 * Byte 0: Central unit
 * Byte 1: Function type (0x02 for dimmer)
 * Byte 2-3: Dimmer number (MSB, LSB)
 * Byte 4: Error state (not used)
 * Byte 5: Current level (0-100)
 * Byte 6: Previous level (optional)
 * @param response The parsed response from the TDS unit
 * @returns DimmerState object containing the dimmer's current state
 * @throws Error if response is invalid or contains invalid values
 */
export function parseDimmerResponse(response: GetResponse): DimmerState {
  if (!response?.payload || response.payload.length < 6) {
    throw new Error('Invalid dimmer response: insufficient data');
  }

  // Extract the current level from the correct byte position
  const level = response.payload[5];

  // Basic validation
  if (level > 100) {
    throw new Error(`Invalid dimmer level in response: ${level}`);
  }

  const state: DimmerState = {
    on: level > 0,
    level: level
  };

  // If there's a previous level stored (dimmer was turned off)
  if (response.payload.length >= 7) {
    const previousLevel = response.payload[6];
    if (previousLevel <= 100) {
      state.previousLevel = previousLevel;
    }
  }

  return state;
}
