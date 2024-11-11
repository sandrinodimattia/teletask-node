import { FunctionType } from './teletask';

export type StateChangeCallback = (change: StateChange) => void;

export interface StateChange {
  /**
   * Central unit number.
   */
  centralUnit: number;

  /**
   * The function type of the state change.
   */
  functionType: FunctionType;

  /**
   * The number of the item that changed.
   */
  number: number;

  /**
   * The new value of the item.
   */
  value: number;
}
