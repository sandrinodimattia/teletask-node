export enum FunctionType {
  RELAY = 0x01,
  DIMMER = 0x02,
  MOTOR = 0x06,
  LOCAL_MOOD = 0x08,
  TIMED_MOOD = 0x09,
  GENERAL_MOOD = 0x0a,
  FLAG = 0x0f,
  SENSOR = 0x14,
  AUDIO = 0x1f,
  PROCESS = 0x03,
  REGIME = 0x0e,
  SERVICE = 0x35,
  MESSAGE = 0x36,
  CONDITION = 0x3c,
  TP_KEY = 0x34
}

export enum Command {
  LOG = 0x03,
  GET = 0x06,
  SET = 0x07,
  RESPONSE = 0x10,
  KEEP_ALIVE = 0x0b
}

export enum FunctionState {
  ON = 0xff,
  OFF = 0x00,
  TOGGLE = 0x67
}

export enum LogState {
  ON = 0xff,
  OFF = 0x00
}

export enum MotorAction {
  UP = 0x01,
  DOWN = 0x02,
  STOP = 0x03,
  START_STOP = 0x06,
  UP_STOP = 0x07,
  DOWN_STOP = 0x08,
  UP_DOWN = 0x37,
  MOTOR_GO_TO_POSITION = 0x0b,
  MOTOR_SUN_PROTECTION = 0x0f
}

export enum AudioAction {
  VOLUME_UP = 0x20,
  VOLUME_DOWN = 0x21,
  ON = 0x24,
  OFF = 0x25,
  FM = 0x26,
  FM2 = 0x2f,
  CD = 0x27,
  CD2 = 0x30,
  TAPE = 0x28,
  TAPE2 = 0x31,
  VIDEO = 0x29,
  VIDEO2 = 0x2b,
  AUX = 0x2a,
  AUX2 = 0x23,
  SRC6 = 0x47,
  SRC7 = 0x48,
  SRC8 = 0x49,
  SRC6_2 = 0x4a,
  SRC7_2 = 0x4b,
  SRC8_2 = 0x4c,
  MUTE = 0x4d
}

export enum SensorAction {
  TEMP_UP = 0x15,
  TEMP_DOWN = 0x16,
  TEMP_FROST = 0x18,
  TEMP_DAY = 0x1a,
  TEMP_NIGHT = 0x19,
  TEMP_STANDBY = 0x5d,
  TEMP_SET_DAY = 0x1d,
  TEMP_SET_STANDBY = 0x58,
  TEMP_SET_NIGHT = 0x1b,
  TEMP_SPEED = 0x1f,
  TEMP_SP_LOW = 0x61,
  TEMP_SP_MED = 0x62,
  TEMP_SP_HIGH = 0x63,
  TEMP_SP_AUTO = 0x59,
  TEMP_MODE = 0x1e,
  TEMP_AUTO = 0x5e,
  TEMP_HEAT = 0x5f,
  TEMP_COOL = 0x60,
  TEMP_VENT = 0x69,
  TEMP_STOP = 0x6a,
  TEMP_HEAT_PLUS = 0x6b,
  TEMP_ON_OFF = 0x68
}

export enum RegimeAction {
  AUTO = 0x00,
  WORKDAY = 0x01,
  WEEKEND = 0x02,
  SIMULATION = 0x03,
  NONE = 0x04,
  CUSTOM = 0x05
}

export enum TPKeyAction {
  PULSE = 0x01,
  CLOSED = 0x02,
  OPENED = 0x03,
  OTHER = 0x09
}
