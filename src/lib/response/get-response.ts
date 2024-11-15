import { FunctionType } from '../../types/teletask';

export type GetResponse = {
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
   * The function byte of the response
   */
  payload: Buffer;
};
