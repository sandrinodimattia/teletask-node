export type ParsedResponse = {
  type: 'event' | 'acknowledge' | 'unknown';
  command?: number;
  payload?: Buffer;
  messageId?: string;
};

export type PresetMode = 'day' | 'night' | 'standby' | 'off';

/**
 * Parse the preset mode
 * @param value
 * @returns
 */
export function parsePresetMode(value: number): PresetMode {
  switch (value) {
    case 0x1a:
      return 'day';
    case 0x19:
      return 'night';
    case 0x5d:
      return 'standby';
    default:
      return 'off';
  }
}

export type OperationMode = 'auto' | 'heat' | 'cool' | 'vent' | 'dry' | 'off';

/**
 * Parse an operation mode
 * @param value
 * @returns
 */
export function parseOperationMode(value: number): OperationMode {
  switch (value) {
    case 0x94:
      return 'auto';
    case 0x95:
      return 'heat';
    case 0x96:
      return 'cool';
    case 0x69:
      return 'vent';
    case 0x6a:
      return 'dry';
    default:
      return 'off';
  }
}

export type FanSpeed = 'auto' | 'low' | 'medium' | 'high';

/**
 * Parse a fan speed
 * @param value
 * @returns
 */
export function parseFanSpeed(value: number): FanSpeed {
  switch (value) {
    case 0x89:
      return 'auto';
    case 0x97:
      return 'low';
    case 0x98:
      return 'medium';
    case 0x99:
      return 'high';
    default:
      return 'auto';
  }
}

/**
 * Parse a sensor response into a strongly typed SensorState object
 */
export function parseSensorResponse(response: ParsedResponse): SensorState {
  if (!response || !response.payload) {
    throw new Error('Invalid sensor response');
  }

  const payload = response.payload;
  const sensorType = determineSensorType(payload);

  switch (sensorType) {
    case 'temperature':
      return parseTemperatureSensor(payload);
    case 'humidity':
      return parseHumiditySensor(payload);
    case 'light':
      return parseLightSensor(payload);
    case 'temperatureControl':
      return parseTemperatureControlSensor(payload);
    case 'pulseCounter':
      return parsePulseCounterSensor(payload);
    default:
      return parseGenericSensor(payload);
  }
}

export type SensorType = 'temperature' | 'humidity' | 'light' | 'temperatureControl' | 'pulseCounter' | 'generic';
export type SensorState = {
  type: SensorType;
  temperature?: number;
  humidity?: number;
  light?: number;
  current?: number;
  total?: number;
  targetTemperature?: number;
  dayPreset?: number;
  nightPreset?: number;
  standbyOffset?: number;
  preset?: PresetMode;
  mode?: OperationMode;
  fanSpeed?: FanSpeed;
  state?: 'on' | 'off';
  windowOpen?: boolean;
  outputState?: number;
  swingDirection?: number;
  unit?: string;
  value?: number;
};

/**
 * Determine the sensor type based on the payload
 * @param payload Payload where first byte indicates sensor type
 * @returns
 */
export function determineSensorType(payload: Buffer): SensorType {
  switch (payload[1]) {
    case 0x01:
      return 'temperature';
    case 0x02:
      return 'humidity';
    case 0x03:
      return 'light';
    case 0x04:
      return 'temperatureControl';
    case 0x05:
      return 'pulseCounter';
    default:
      return 'generic';
  }
}

/**
 * Parse the temperature sensor payload
 * @param payload
 * @returns
 */
export function parseTemperatureSensor(payload: Buffer): SensorState {
  const rawValue = (payload[0] << 8) | payload[1];

  // Check for sensor error
  if (rawValue >= 0x3f00) {
    throw new Error('Temperature sensor error detected');
  }

  // Convert according to TDS spec: value/10 - 273
  const temperature = rawValue / 10 - 273;

  return {
    type: 'temperature',
    temperature: Number(temperature.toFixed(1)),
    unit: '°C'
  };
}

/**
 * Parse the humidity sensor payload
 * @param payload
 * @returns
 */
export function parseHumiditySensor(payload: Buffer): SensorState {
  const humidity = payload[0];

  return {
    type: 'humidity',
    humidity,
    unit: '%'
  };
}

/**
 * Parse the temperature control sensor payload
 * @param payload
 * @returns
 */
export function parseTemperatureControlSensor(payload: Buffer): SensorState {
  return {
    type: 'temperatureControl',
    temperature: convertToTemperature((payload[0] << 8) | payload[1]),
    targetTemperature: convertToTemperature((payload[2] << 8) | payload[3]),
    dayPreset: convertToTemperature((payload[4] << 8) | payload[5]),
    nightPreset: convertToTemperature((payload[6] << 8) | payload[7]),
    standbyOffset: payload[8] / 10,
    preset: parsePresetMode(payload[9]),
    mode: parseOperationMode(payload[10]),
    fanSpeed: parseFanSpeed(payload[11]),
    state: payload[12] === 0xff ? 'on' : 'off',
    windowOpen: payload[13] === 0xff,
    outputState: payload[14],
    swingDirection: payload[15]
  };
}

/**
 * Convert value to temperature
 * @param value
 * @returns
 */
function convertToTemperature(value: number): number {
  return Number((value / 10 - 273).toFixed(1));
}

/**
 * Parse the pulse counter sensor payload
 * @param payload
 * @returns
 */
export function parsePulseCounterSensor(payload: Buffer): SensorState {
  return {
    type: 'pulseCounter',
    current: (payload[0] << 8) | payload[1],
    total: payload.readUInt32BE(16) / 1000,
    unit: 'kWh'
  };
}

/**
 * Parse data from a generic sensor
 * @param payload
 * @returns
 */
export function parseGenericSensor(payload: Buffer): SensorState {
  return {
    type: 'generic',
    value: payload.readUInt16BE(0)
  };
}

/**
 * Parse the temperature control sensor payload
 * @param payload
 * @returns
 */
export function parseLightSensor(payload: Buffer): SensorState {
  const rawValue = (payload[0] << 8) | payload[1];
  // Convert according to TDS spec: 10^(value/40) - 1
  const luxValue = Math.pow(10, rawValue / 40) - 1;

  return {
    type: 'light',
    light: Math.round(luxValue),
    unit: 'lux'
  };
}

export type MotorState = {
  moving: boolean;
  direction: MotorDirection;
  position: number;
  targetPosition?: number;
  protection: MotorProtectionState;
  timeToFinishSeconds: number;
  calibration: {
    correctionAtZeroPercent: number;
    correctionAtHundredPercent: number;
  };
};

/**
 * Parse a motor response
 */
export function parseMotorResponse(response: ParsedResponse): MotorState {
  if (!response || !response.payload || response.payload.length < 9) {
    throw new Error('Invalid motor response');
  }

  const payload = response.payload;
  const direction = payload[0]; // Direction byte
  const power = payload[1]; // Power/State byte
  const protection = payload[2]; // Protection byte
  const position = payload[3]; // Position percentage
  const currentPosition = payload[4]; // Current position
  const timeToFinish = (payload[5] << 8) | payload[6]; // Time to finish in centiseconds
  const correctionZero = payload[7]; // Correction at 0%
  const correctionHundred = payload[8]; // Correction at 100%

  return {
    moving: power === 0xff,
    direction: parseMotorDirection(direction),
    position: currentPosition,
    targetPosition: position,
    protection: parseMotorProtection(protection),
    timeToFinishSeconds: timeToFinish / 100,
    calibration: {
      correctionAtZeroPercent: correctionZero,
      correctionAtHundredPercent: correctionHundred
    }
  };
}

export type MotorDirection = 'up' | 'down' | 'stopped';

/**
 * Parse the direction of a motor
 * @param direction
 * @returns
 */
export function parseMotorDirection(direction: number): MotorDirection {
  switch (direction) {
    case 0x01:
      return 'up';
    case 0x02:
      return 'down';
    default:
      return 'stopped';
  }
}

export type MotorProtectionState =
  | 'notDefined'
  | 'onControlled'
  | 'onNotControlled'
  | 'onOverruled'
  | 'off'
  | 'unknown';

/**
 * Parse the motor protection state
 * @param protection
 * @returns
 */
export function parseMotorProtection(protection: number): MotorProtectionState {
  switch (protection) {
    case 0x00:
      return 'notDefined';
    case 0x01:
      return 'onControlled';
    case 0x02:
      return 'onNotControlled';
    case 0x03:
      return 'onOverruled';
    case 0x04:
      return 'off';
    default:
      return 'unknown';
  }
}
