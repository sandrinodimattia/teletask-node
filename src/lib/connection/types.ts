export interface ConnectionOptions {
  /**
   * Automatically reconnect when the connection is lost.
   */
  autoReconnect?: boolean;

  /**
   * Delay in milliseconds before attempting to reconnect.
   */
  reconnectDelay?: number;

  /**
   * Interval for sending keep-alive messages to the remote host.
   */
  keepAliveInterval?: number;

  /**
   * Timeout for waiting for a response from the remote host.
   */
  responseTimeout?: number;

  /**
   * Maximum number of reconnection attempts before giving up.
   */
  maxReconnectAttempts?: number;
}

export interface ConnectionState {
  /**
   * Indicates whether the connection is currently established.
   */
  connected: boolean;

  /**
   * Number of reconnection attempts made so far.
   */
  reconnectAttempts: number;
}
