import {
  FunctionType,
  Command,
  LogState,
  AudioAction,
  MotorAction,
  RegimeAction,
  SensorAction
} from './types/teletask';
import { TeletaskOptions } from './types/config';
import { StateChange, StateChangeCallback } from './types/state';

import {
  validateComponentParameters,
  validateMotorAction,
  validateMotorPosition,
  validateRange
} from './lib/validation';

import { TeletaskConnection } from './lib/connection';
import { GetResponse } from './lib/response/get-response';
import { MotorState, parseMotorResponse } from './lib/response/motor';
import { parseRelayResponse, RelayState } from './lib/response/relay';
import { DimmerState, parseDimmerResponse } from './lib/response/dimmer';

export class TeletaskClient {
  /***
   * Connection to the TELETASK central unit.
   */
  private connection: TeletaskConnection;

  /**
   * Function types that are currently being monitored.
   */
  private readonly functionTypeLoggers: Map<FunctionType, boolean>;

  /**
   * Subscribers for state changes.
   */
  private readonly subscribers: Map<FunctionType, Set<StateChangeCallback>>;

  /**
   * Timeout for waiting for a GET response.
   */
  private readonly responseTimeout = 4000; // Default timeout for queries

  /**
   * Response handlers for GET commands.
   */
  private responseHandlers: Map<string, (response: GetResponse) => void> = new Map();

  /**
   * TELETASK client.
   * @param host The IP address of the TELETASK central unit.
   * @param port The port number of the TELETASK central unit (default: 55957).
   * @param options Connection options.
   */
  constructor(host: string, port: number = 55957, options: TeletaskOptions = { connection: {} }) {
    this.subscribers = new Map();
    this.functionTypeLoggers = new Map();

    // Configure the connection.
    this.connection = new TeletaskConnection(host, port, options.connection);

    // Keep alive.
    this.connection.onKeepAlive(() => {
      this.sendKeepAlive();
    });

    // Handle incoming data.
    this.connection.onDataReceived((data: Buffer) => {
      this.handleResponse(data);
    });

    // Start listening for messages for previously subscribed functions.
    this.connection.onConnectionReady(() => {
      this.sendKeepAlive();

      // Re-enable logging for previously subscribed functions.
      this.functionTypeLoggers.forEach((state, functionType) => {
        this.functionTypeLogging(functionType, state);
      });
    });
  }

  /**
   * Connect to the TELETASK central unit.
   */
  public async connect(): Promise<void> {
    await this.connection.connect();
  }

  /**
   * Disconnect from the TELETASK central unit.
   */
  public disconnect(): void {
    this.connection.disconnect();
  }

  /**
   * Check if the client is connected to the TELETASK central unit.
   * @returns Whether the client is connected or not.
   */
  public isConnected(): boolean {
    return this.connection.isConnected();
  }

  /**
   * Register an event handler when the connection is ready.
   * @param handler The handler to call when the connection is ready.
   */
  public onConnected(handler: () => void): void {
    this.connection.onConnectionReady(handler);
  }

  /**
   * Register an event handler when the connection is lost.
   * @param handler The handler to call when the connection is lost.
   */
  public onDisconnected(handler: (error?: Error) => void): void {
    this.connection.onDisconnected(handler);
  }

  /**
   * Register an event handler when a reconnection attempt is made.
   * @param handler The handler to call when a reconnection attempt is made.
   */
  public onReconnecting(handler: (attempt: number) => void): void {
    this.connection.onReconnecting(handler);
  }

  /**
   * Register an event handler when a connection error occurs.
   * @param handler The handler to call when a connection error occurs.
   */
  public onConnectionError(handler: (error: Error) => void): void {
    this.connection.onConnectionError(handler);
  }

  /**
   * Register an event handler when a timeout occurs.
   * @param handler The handler to call when a timeout occurs.
   */
  public onTimeout(handler: () => void): void {
    this.connection.onTimeout(handler);
  }

  /**
   * Build a command to send to the unit.
   * @param command The command number.
   * @param parameters Parameters to send with the command
   * @returns
   */
  private buildCommand(command: number, parameters: number[]): Buffer {
    const paramBuffer = Buffer.from(parameters);

    // Calculate the total length
    // Length = STX (1) + Length byte (1) + Command byte (1) + Parameters + Checksum (1)
    const length = 3 + paramBuffer.length;

    // Create buffer with space for all bytes including checksum
    const buffer = Buffer.alloc(length + 1);

    buffer[0] = 0x02; // STX
    buffer[1] = length; // Length
    buffer[2] = command; // Command (0x06 for GET)
    paramBuffer.copy(buffer, 3);

    /**
     * Alternative way to build the buffer:
     * for (let i = 0; i < parameters.length; i++) {
     *    buffer[i + 3] = parameters[i] & 0xff;
     * }
     */

    // Calculate and write checksum
    let checksum = 0;
    for (let i = 0; i < length; i++) {
      checksum += buffer[i];
    }

    buffer[length] = checksum & 0xff;
    return buffer;
  }

  /**
   * Send a raw command.
   * @param command
   * @param parameters
   */
  private sendCommand(command: number, parameters: number[]): void {
    if (!this.isConnected()) {
      throw new Error('Not connected to TELETASK central unit');
    }

    const buffer = this.buildCommand(command, parameters);
    this.connection.send(buffer);
  }

  /**
   * Handles a response from the unit.
   * @param data
   * @returns
   */
  private handleResponse(data: Buffer): void {
    // Process each byte to find complete messages
    let currentIndex = 0;
    while (currentIndex < data.length) {
      // Check for acknowledge byte
      if (data[currentIndex] === 0x0a) {
        currentIndex++;
        continue;
      }

      // Check for STX
      if (data[currentIndex] === 0x02) {
        if (currentIndex + 1 >= data.length) {
          break;
        }

        const messageLength = data[currentIndex + 1];
        const messageEnd = currentIndex + messageLength + 1;

        // Make sure we have complete message
        if (messageEnd > data.length) {
          break;
        }

        // Extract complete message
        const message = data.slice(currentIndex, messageEnd);
        const command = message[2];
        if (command === Command.LOG) {
          this.handleEvent(message);
        } else if (command === Command.KEEP_ALIVE) {
          // Do nothing
        } else if (command === Command.RESPONSE) {
          this.handleGetResponse(message);
        } else {
          throw new Error(`Unknown command: ${command}`);
        }

        // Move to next message
        currentIndex = messageEnd;
      } else {
        // Skip unknown byte
        currentIndex++;
      }
    }
  }

  /**
   * Handle an incoming log event.
   */
  private handleEvent(data: Buffer): void {
    const payload = data.slice(3, -1);
    const stateChange: StateChange = {
      centralUnit: payload[0],
      functionType: payload[1] as FunctionType,
      number: (payload[2] << 8) | payload[3],
      value: payload[5]
    };

    // Notify specific subscribers
    this.subscribers.get(stateChange.functionType)?.forEach((callback) => {
      callback(stateChange);
    });
  }

  /**
   * Enables or disables logging for a specific function type
   * @param functionType The type of function to log (relay, dimmer, etc.)
   * @param enabled Whether to enable (true) or disable (false) logging
   */
  private functionTypeLogging(functionType: FunctionType, enabled: boolean): void {
    if (!Object.values(FunctionType).includes(functionType)) {
      throw new Error(`Invalid function type: ${functionType}`);
    }

    this.sendCommand(Command.LOG, [functionType, enabled ? LogState.ON : LogState.OFF]);
    this.functionTypeLoggers.set(functionType, enabled);
  }

  /**
   * Subscribe to state changes for a specific function type.
   * @param functionType
   * @param callback
   */
  public subscribe(functionType: FunctionType, callback: StateChangeCallback): void {
    if (!Object.values(FunctionType).includes(functionType)) {
      throw new Error(`Invalid function type: ${functionType}`);
    }

    // Initialize subscriber set if needed
    if (!this.subscribers.has(functionType)) {
      this.subscribers.set(functionType, new Set());
    }

    // Add subscriber
    this.subscribers.get(functionType)?.add(callback);

    // Enable logging if first subscriber
    if (!this.functionTypeLoggers.get(functionType)) {
      this.functionTypeLogging(functionType, true);
    }
  }

  /**
   * Unsubscribe from state changes for a specific function type.
   * @param functionType
   * @param callback
   */
  public unsubscribe(functionType: FunctionType, callback: StateChangeCallback): void {
    const subscribers = this.subscribers.get(functionType);
    if (subscribers) {
      subscribers.delete(callback);

      // Disable logging if no subscribers left
      if (subscribers.size === 0) {
        this.functionTypeLogging(functionType, false);
      }
    }
  }

  /**
   * Sends a GET command and waits for its response
   */
  private async waitForGet(parameters: number[], messageId: string): Promise<GetResponse> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.responseHandlers.delete(messageId);
        reject(new Error(`Response timeout for GET command: ${messageId}`));
      }, this.responseTimeout);

      // Set up response handler before sending command
      this.responseHandlers.set(messageId, (response: GetResponse) => {
        clearTimeout(timeoutId);
        this.responseHandlers.delete(messageId);
        resolve(response);
      });

      try {
        this.sendCommand(Command.GET, parameters);
      } catch (error) {
        clearTimeout(timeoutId);
        this.responseHandlers.delete(messageId);
        reject(error);
      }
    });
  }

  /**
   * Handle the response of a GET command.
   * @param data
   */
  private handleGetResponse(data: Buffer): void {
    const payload = data.slice(3, -1);
    const centralUnit = payload[0];
    const functionType = payload[1];
    const number = (payload[2] << 8) | payload[3];

    // Send response to handler for this specific message
    const messageId = `${functionType}_${centralUnit}_${number}`;
    const handler = this.responseHandlers.get(messageId);
    if (handler) {
      handler({
        centralUnit,
        functionType,
        number,
        payload
      });
      this.responseHandlers.delete(messageId);
    }
  }

  /**
   * Send a keep-alive command.
   */
  private sendKeepAlive(): void {
    this.sendCommand(0x0b, []);
  }

  /**
   * Query the status of a relay
   */
  public async queryRelay(centralUnit: number, relay: number): Promise<RelayState> {
    validateRange(centralUnit, 1, 10, 'Central unit');
    validateRange(relay, 0, 0xffff, 'Relay number');

    // Parameters array:
    // [Central Unit, Function Type, Number MSB, Number LSB]
    const parameters = [centralUnit, FunctionType.RELAY, (relay >> 8) & 0xff, relay & 0xff];

    // Format according to TDS spec:
    // STX | Length | Command | Central Unit | Function | Number MSB | Number LSB | Checksum

    // Example of what gets sent for relay 1 on central unit 1:
    // 02 07 06 01 01 00 01 12
    //  |  |  |  |  |  |  |  └─ Checksum
    //  |  |  |  |  |  └──┴──── Relay number (0x0001)
    //  |  |  |  |  └───────── Function type (RELAY = 0x01)
    //  |  |  |  └────────── Central unit (0x01)
    //  |  |  └─────────── Command (GET = 0x06)
    //  |  └──────────── Length (7 bytes)
    //  └───────────── STX (0x02)
    const messageId = `${FunctionType.RELAY}_${centralUnit}_${relay}`;
    const response = await this.waitForGet(parameters, messageId);
    return parseRelayResponse(response);
  }

  /**
   * Control the state of a relay.
   * @param centralUnit
   * @param relay
   * @param state
   */
  public async setRelay(centralUnit: number, relay: number, state: boolean): Promise<void> {
    await this.sendCommand(Command.SET, [
      centralUnit,
      FunctionType.RELAY,
      (relay >> 8) & 0xff,
      relay & 0xff,
      state ? 0xff : 0x00
    ]);
  }

  /**
   * Query the status of a dimmer
   */
  public async queryDimmer(centralUnit: number, dimmer: number): Promise<DimmerState> {
    validateRange(centralUnit, 1, 10, 'Central unit');
    validateRange(dimmer, 0, 0xffff, 'Dimmer number');

    // Parameters array:
    // [Central Unit, Function Type, Number MSB, Number LSB]
    const parameters = [centralUnit, FunctionType.DIMMER, (dimmer >> 8) & 0xff, dimmer & 0xff];

    // Example of what gets sent for dimmer 1 on central unit 1:
    // 02 07 06 01 02 00 01 13
    //  |  |  |  |  |  |  |  └─ Checksum
    //  |  |  |  |  |  └──┴──── Dimmer number (0x0001)
    //  |  |  |  |  └───────── Function type (DIMMER = 0x02)
    //  |  |  |  └────────── Central unit (0x01)
    //  |  |  └─────────── Command (GET = 0x06)
    //  |  └──────────── Length (7 bytes)
    //  └───────────── STX (0x02)
    const messageId = `${FunctionType.DIMMER}_${centralUnit}_${dimmer}`;
    const response = await this.waitForGet(parameters, messageId);
    return parseDimmerResponse(response);
  }

  /**
   * Control the state of a dimmer.
   * @param centralUnit
   * @param dimmer
   * @param level
   */
  public async setDimmer(centralUnit: number, dimmer: number, level: number): Promise<void> {
    if (level < 0 || level > 100) {
      throw new Error('Dimmer level must be between 0 and 100');
    }

    this.sendCommand(Command.SET, [centralUnit, FunctionType.DIMMER, (dimmer >> 8) & 0xff, dimmer & 0xff, level]);
  }

  /**
   * Query a motor's current state
   */
  public async queryMotor(centralUnit: number, motor: number): Promise<MotorState> {
    validateRange(centralUnit, 1, 10, 'Central unit');
    validateRange(motor, 0, 0xffff, 'Motor number');

    // Parameters array:
    // [Central Unit, Function Type, Number MSB, Number LSB]
    const parameters = [centralUnit, FunctionType.MOTOR, (motor >> 8) & 0xff, motor & 0xff];

    const messageId = `${FunctionType.MOTOR}_${centralUnit}_${motor}`;
    const response = await this.waitForGet(parameters, messageId);
    return parseMotorResponse(response);
  }

  /**
   * Enhanced setMotor method with proper position handling
   */
  public async setMotor(centralUnit: number, motor: number, actionOrPosition: MotorAction | number): Promise<void> {
    validateComponentParameters(centralUnit, motor, 'Motor');

    if (typeof actionOrPosition === 'number') {
      // Handle position setting
      validateMotorPosition(actionOrPosition);
      await this.sendCommand(Command.SET, [
        centralUnit,
        FunctionType.MOTOR,
        (motor >> 8) & 0xff,
        motor & 0xff,
        MotorAction.MOTOR_GO_TO_POSITION,
        actionOrPosition
      ]);
    } else {
      // Handle regular motor actions
      validateMotorAction(actionOrPosition);
      await this.sendCommand(Command.SET, [
        centralUnit,
        FunctionType.MOTOR,
        (motor >> 8) & 0xff,
        motor & 0xff,
        actionOrPosition
      ]);
    }
  }
  /**
   * Helper method to move motor to position
   */
  public async setMotorPosition(centralUnit: number, motor: number, position: number): Promise<void> {
    return this.setMotor(centralUnit, motor, position);
  }

  /**
   * Helper method for sun protection
   */
  public async setMotorSunProtection(centralUnit: number, motor: number, enabled: boolean): Promise<void> {
    if (enabled) {
      return this.setMotor(centralUnit, motor, MotorAction.MOTOR_SUN_PROTECTION);
    } else {
      return this.setMotor(centralUnit, motor, MotorAction.STOP);
    }
  }

  /**
   * Control the state of an audio zone.
   * @param centralUnit
   * @param zone
   * @param action
   */
  public setAudio(centralUnit: number, zone: number, action: AudioAction): void {
    this.sendCommand(Command.SET, [centralUnit, FunctionType.AUDIO, (zone >> 8) & 0xff, zone & 0xff, action]);
  }

  /**
   * Control the state of a sensor.
   * @param centralUnit
   * @param sensor
   * @param action
   * @param value
   */
  public async setSensor(centralUnit: number, sensor: number, action: SensorAction, value?: number): Promise<void> {
    const params = [centralUnit, FunctionType.SENSOR, (sensor >> 8) & 0xff, sensor & 0xff, action];
    if (value !== undefined) {
      params.push((value >> 8) & 0xff, value & 0xff);
    }

    this.sendCommand(Command.SET, params);
  }

  /**
   * Control a local mood.
   * @param mood
   * @param state
   */
  public async setLocalMood(mood: number, state: boolean | number): Promise<void> {
    const value = typeof state === 'boolean' ? (state ? 0xff : 0x00) : Math.min(100, Math.max(0, state));
    this.sendCommand(Command.SET, [0, FunctionType.LOCAL_MOOD, (mood >> 8) & 0xff, mood & 0xff, value]);
  }

  /**
   * Control a general mood.
   * @param mood
   * @param state
   */
  public async setGeneralMood(mood: number, state: boolean | number): Promise<void> {
    const value = typeof state === 'boolean' ? (state ? 0xff : 0x00) : Math.min(100, Math.max(0, state));
    this.sendCommand(Command.SET, [0, FunctionType.GENERAL_MOOD, (mood >> 8) & 0xff, mood & 0xff, value]);
  }

  /**
   * Control a regime.
   * @param mood
   * @param state
   */
  public setRegime(regime: RegimeAction, state: boolean = true): void {
    this.sendCommand(Command.SET, [0, FunctionType.REGIME, 0x00, regime, state ? 0xff : 0x00]);
  }
}
