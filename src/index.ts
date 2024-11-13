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

import { ParsedResponse } from './lib/utils';
import { TeletaskConnection } from './lib/connection';

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
    const length = 3 + paramBuffer.length;
    const buffer = Buffer.alloc(length + 1);

    buffer[0] = 0x02; // STX
    buffer[1] = length;
    buffer[2] = command;
    paramBuffer.copy(buffer, 3);

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
   * Calculate the checksum of the incoming data.
   */
  private calculateChecksum(data: Buffer): number {
    return data.reduce((sum, byte) => sum + byte, 0) & 0xff;
  }

  /**
   * Handles a response from the unit.
   * @param data
   * @returns
   */
  private handleResponse(data: Buffer): void {
    // Acknowledge byte
    if (data.length === 1 && data[0] === 0x0a) {
      return;
    }

    // Invalid start byte
    if (data[0] !== 0x02) {
      return;
    }

    // Extract payload
    const command = data[2];
    if (command === 0x10) {
      this.handleEvent(data.slice(3, -1));
    } else {
      throw new Error(`Unknown command: ${command}`);
    }
  }

  /**
   * Handle an incoming event.
   */
  private handleEvent(data: Buffer): void {
    const stateChange: StateChange = {
      centralUnit: data[0],
      functionType: data[1] as FunctionType,
      number: (data[2] << 8) | data[3],
      value: data[5]
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
   * Send a keep-alive command.
   */
  private sendKeepAlive(): void {
    this.sendCommand(0x0b, []);
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
   * Control the state of a motor.
   * @param centralUnit
   * @param motor
   * @param action
   */
  public async setMotor(centralUnit: number, motor: number, action: MotorAction): Promise<void> {
    this.sendCommand(Command.SET, [centralUnit, FunctionType.MOTOR, (motor >> 8) & 0xff, motor & 0xff, action]);
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
