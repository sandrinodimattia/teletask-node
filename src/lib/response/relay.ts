import { GetResponse } from './get-response';

/**
 * State of a relay
 */
export type RelayState = {
  on: boolean;
};

/**
 * Parse a relay response according to TDS protocol
 * Format of response payload:
 * Byte 0: Central unit
 * Byte 1: Function type (0x01 for relay)
 * Byte 2-3: Relay number (MSB, LSB)
 * Byte 4: Error state (not used)
 * Byte 5: Current state (0x00 = OFF, 0xFF = ON)
 */
export function parseRelayResponse(response: GetResponse): RelayState {
  if (!response?.payload || response.payload.length < 6) {
    throw new Error('Invalid relay response: insufficient data');
  }

  // Extract the state value from the correct byte position
  const stateValue = response.payload[5];

  // According to TDS spec:
  // 0x00 = OFF
  // 0xFF = ON
  // Validate the state value
  if (stateValue !== 0x00 && stateValue !== 0xff) {
    throw new Error(`Invalid relay state value: ${stateValue}`);
  }

  return {
    on: stateValue === 0xff
  };
}
