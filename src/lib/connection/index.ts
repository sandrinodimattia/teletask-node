import { Socket } from 'net';

import { ConnectionOptions, ConnectionState } from './types';
export { ConnectionOptions, ConnectionState } from './types';

export class TeletaskConnection {
  /**
   * Socket instance used for communication.
   */
  private socket: Socket | null = null;

  /**
   * Timers for keep-alive and reconnection.
   */
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;

  /**
   * Connection state.
   */
  private state: ConnectionState = {
    connected: false,
    reconnectAttempts: 0
  };

  /**
   * Connection options with default values.
   */
  private readonly options: Required<ConnectionOptions> = {
    autoReconnect: true,
    reconnectDelay: 5000,
    keepAliveInterval: 240000,
    responseTimeout: 4000,
    maxReconnectAttempts: 10
  };

  /**
   * Event handlers for connection events.
   */
  private eventHandlers = {
    onConnected: [] as Array<() => void>,
    onConnectionReady: [] as Array<() => void>,
    onDataReceived: [] as Array<(data: Buffer) => void>,
    onKeepAlive: [] as Array<() => void>,
    onDisconnected: [] as Array<(error?: Error) => void>,
    onReconnecting: [] as Array<(attempt: number) => void>,
    onConnectionError: [] as Array<(error: Error) => void>,
    onTimeout: [] as Array<() => void>
  };

  /**
   * Connection manager constructor.
   * @param host Hostname or IP address of the remote host.
   * @param port Port number of the remote host.
   * @param options Optional connection options.
   */
  constructor(
    private readonly host: string,
    private readonly port: number,
    options?: Partial<ConnectionOptions>
  ) {
    this.options = { ...this.options, ...options };
  }

  /**
   * Connect to the remote host.
   * @returns Promise that resolves when the connection is established.
   */
  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Clean up the existing socket if any.
      if (this.socket) {
        this.socket.destroy();
      }

      // Create a new socket.
      this.socket = new Socket();

      // Socket connected.
      this.socket.on('connect', () => {
        this.state.connected = true;
        this.state.reconnectAttempts = 0;

        // Notify all onConnected callbacks.
        this.eventHandlers.onConnected.forEach((handler) => handler());

        // Start the keep-alive process.
        this.startKeepAlive();

        // Continue the promise chain.
        resolve();
      });

      // Socket is ready.
      this.socket.on('ready', () => {
        // Notify all onConnectionReady callbacks.
        this.eventHandlers.onConnectionReady.forEach((handler) => handler());
      });

      // Socket error.
      this.socket.on('error', (error: Error) => {
        // Notify all onConnectionError callbacks.
        this.eventHandlers.onConnectionError.forEach((handler) => handler(error));

        // Reject the promise if not connected.
        if (!this.state.connected) {
          reject(error);
        }
      });

      // Socket closed.
      this.socket.on('close', (hadError: boolean) => {
        this.stopKeepAlive();
        this.state.connected = false;

        // Notify all onDisconnected callbacks.
        this.eventHandlers.onDisconnected.forEach((handler) =>
          handler(hadError ? new Error('Connection closed with error') : undefined)
        );

        // Schedule a reconnection attempt if needed.
        if (this.options.autoReconnect) {
          this.scheduleReconnect();
        }
      });

      // Socket data received.
      this.socket.on('data', (data: Buffer) => {
        // Notify all onDataReceived callbacks.
        this.eventHandlers.onDataReceived.forEach((handler) => handler(data));
      });

      // Socket timeout.
      this.socket.on('timeout', () => {
        // Notify all onTimeout callbacks.
        this.eventHandlers.onTimeout.forEach((handler) => handler());

        // Clean up the socket.
        this.socket?.destroy();
      });

      try {
        this.socket.connect({
          host: this.host,
          port: this.port
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the remote host.
   */
  public disconnect(): void {
    this.options.autoReconnect = false;
    this.stopReconnectTimer();
    this.stopKeepAlive();

    // Clean up the socket.
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }

  /**
   * Check if the connection is established.
   * @returns True if the connection is established, false otherwise.
   */
  public isConnected(): boolean {
    return this.state.connected;
  }

  /**
   * Send data to the remote host.
   * @param data Data to send.
   */
  public send(data: Buffer): void {
    if (!this.isConnected() || !this.socket) {
      throw new Error('Not connected to a TELETASK central unit');
    }

    try {
      this.socket.write(data);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get the current connection state.
   * @returns The connection state.
   */
  public getState(): Readonly<ConnectionState> {
    return { ...this.state };
  }

  /**
   * Start the keep-alive process.
   */
  private startKeepAlive(): void {
    // Method to send a keep-alive message.
    const keepAlive = () => {
      if (this.state.connected) {
        this.eventHandlers.onKeepAlive.forEach((handler) => handler());
      }
    };

    // Stop the existing keep-alive process and start a new one.
    this.stopKeepAlive();
    this.keepAliveTimer = setInterval(keepAlive, this.options.keepAliveInterval);
  }

  /**
   * Stop the keep-alive process.
   */
  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  /**
   * Schedule a reconnection attempt.
   * @returns
   */
  private scheduleReconnect(): void {
    this.stopReconnectTimer();

    // Method to attempt a reconnect.
    const reconnect = async () => {
      try {
        await this.connect();
      } catch (error) {
        this.scheduleReconnect();
      }
    };

    // Only attempt to reconnect a certain number of times.
    if (this.state.reconnectAttempts >= this.options.maxReconnectAttempts) {
      const error = new Error('Maximum number of reconnection attempts reached');
      this.eventHandlers.onConnectionError.forEach((handler) => handler(error));
      return;
    }

    // Keep track of the number of attempts.
    this.state.reconnectAttempts++;

    // Notify all onReconnecting callbacks.
    this.eventHandlers.onReconnecting.forEach((handler) => handler(this.state.reconnectAttempts));

    // Schedule the reconnect attempt.
    this.reconnectTimer = setTimeout(reconnect, this.options.reconnectDelay);
  }

  /**
   * Stop the reconnection timer.
   */
  private stopReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Register an event handler when the connection is established.
   * @param handler The handler to call when the connection is established.
   */
  public onConnected(handler: () => void): void {
    this.eventHandlers.onConnected.push(handler);
  }

  /**
   * Register an event handler when the connection is ready.
   * @param handler The handler to call when the connection is ready.
   */
  public onConnectionReady(handler: () => void): void {
    this.eventHandlers.onConnectionReady.push(handler);
  }

  /**
   * Register an event handler when data is received.
   * @param handler The handler to call when data is received.
   */
  public onDataReceived(handler: (data: Buffer) => void): void {
    this.eventHandlers.onDataReceived.push(handler);
  }

  /**
   * Register an event handler when a keep-alive message needs to be sent.
   */
  public onKeepAlive(handler: () => void): void {
    this.eventHandlers.onKeepAlive.push(handler);
  }

  /**
   * Register an event handler when the connection is lost.
   * @param handler The handler to call when the connection is lost.
   */
  public onDisconnected(handler: (error?: Error) => void): void {
    this.eventHandlers.onDisconnected.push(handler);
  }

  /**
   * Register an event handler when a reconnection attempt is made.
   * @param handler The handler to call when a reconnection attempt is made.
   */
  public onReconnecting(handler: (attempt: number) => void): void {
    this.eventHandlers.onReconnecting.push(handler);
  }

  /**
   * Register an event handler when a connection error occurs.
   * @param handler The handler to call when a connection error occurs.
   */
  public onConnectionError(handler: (error: Error) => void): void {
    this.eventHandlers.onConnectionError.push(handler);
  }

  /**
   * Register an event handler when a timeout occurs.
   * @param handler The handler to call when a timeout occurs.
   */
  public onTimeout(handler: () => void): void {
    this.eventHandlers.onTimeout.push(handler);
  }
}
