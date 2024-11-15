# Teletask Client Library

A TypeScript/JavaScript library for communicating with TELETASK home automation systems over IP (DoIP).

## Features

- Complete support for all TELETASK functions (relays, dimmers, motors, sensors, etc.)
- Automatic connection management with reconnection handling
- Event-based architecture for real-time state updates

## Installation

```bash
npm install teletask
```

## Quick Start

```typescript
import { TeletaskClient } from 'teletask';

// Create a new client instance
const client = new TeletaskClient('192.168.1.100', 55957);

// Connect to the TELETASK system
await client.connect();

// Control a relay
await client.setRelay(1, 5, true);  // Turn on relay 5 on central unit 1

// Control a dimmer
await client.setDimmer(1, 3, 75);   // Set dimmer 3 to 75% on central unit 1

// Subscribe to state changes
client.subscribe(FunctionType.RELAY, (change) => {
  console.log(`Relay ${change.number} changed to ${change.value}`);
});
```

## Connection Management

```typescript
const client = new TeletaskClient('192.168.1.100', 55957, {
  connection: {
    autoReconnect: true,
    reconnectDelay: 5000,
    keepAliveInterval: 240000,
    responseTimeout: 4000,
    maxReconnectAttempts: 10
  }
});

// Event handlers
client.onConnected(() => {
  console.log('Connected to TELETASK system');
});

client.onConnected(() => {
  log('Connected to TELETASK system');
});

client.onDisconnected((error?: Error) => {
  log(`Disconnected from TELETASK system${error ? `: ${error.message}` : ''}`);
});

client.onReconnecting((attempt: number) => {
  log(`Reconnecting to TELETASK system (attempt ${attempt})`);
});

client.onConnectionError((error: Error) => {
  log(`Connection error: ${error.message}`);
});

client.onTimeout(() => {
  console.log('Connection timeout');
});
```

## Controlling Components

### Relays

```typescript
// Query relay state
const state = await client.queryRelay(1, 5);
console.log('Relay is:', state.on ? 'ON' : 'OFF');

// Control relay
await client.setRelay(1, 5, true);   // Turn ON
await client.setRelay(1, 5, false);  // Turn OFF
```

### Dimmers

```typescript
// Query dimmer state
const state = await client.queryDimmer(1, 3);
console.log('Dimmer level:', state.level);
console.log('Is on:', state.on);

// Control dimmer
await client.setDimmer(1, 3, 100);  // Full brightness
await client.setDimmer(1, 3, 50);   // 50% brightness
await client.setDimmer(1, 3, 0);    // Off
```

### Motors

```typescript
// Query motor state
const state = await client.queryMotor(1, 2);
console.log('Motor position:', state.position);
console.log('Is moving:', state.moving);
console.log('Direction:', state.direction);

// Control motor
await client.setMotor(1, 2, MotorAction.UP);
await client.setMotor(1, 2, MotorAction.DOWN);
await client.setMotor(1, 2, MotorAction.STOP);

// Move to specific position
await client.setMotorPosition(1, 2, 75);  // Move to 75%

// Sun protection
await client.setMotorSunProtection(1, 2, true);  // Enable
await client.setMotorSunProtection(1, 2, false); // Disable
```

### Audio Control

```typescript
// Control audio zones
client.setAudio(1, 1, AudioAction.ON);
client.setAudio(1, 1, AudioAction.VOLUME_UP);
client.setAudio(1, 1, AudioAction.VOLUME_DOWN);
client.setAudio(1, 1, AudioAction.MUTE);
client.setAudio(1, 1, AudioAction.OFF);
```

### Moods and Regimes

```typescript
// Control moods
await client.setLocalMood(1, true);      // Activate local mood
await client.setGeneralMood(1, true);    // Activate general mood

// Control regimes
client.setRegime(RegimeAction.AUTO);     // Set to auto regime
client.setRegime(RegimeAction.WORKDAY);  // Set to workday regime
```

## Event Handling

Subscribe to state changes for real-time updates:

```typescript
// Subscribe to relay changes
client.subscribe(FunctionType.RELAY, (change) => {
  console.log(`Relay ${change.number} changed to ${change.value}`);
});

// Subscribe to dimmer changes
client.subscribe(FunctionType.DIMMER, (change) => {
  console.log(`Dimmer ${change.number} changed to ${change.value}%`);
});

// Subscribe to motor changes
client.subscribe(FunctionType.MOTOR, (change) => {
  console.log(`Motor ${change.number} state changed:`, change.value);
});

// Unsubscribe from events
client.unsubscribe(FunctionType.RELAY, handlerFunction);
```

## Protocol Support

This library implements the TELETASK DoIP (Domotics over IP) protocol version 3.4. It communicates with TELETASK central units using TCP/IP on port 55957.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.