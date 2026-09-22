// motion-schemas-sha256: 2b5ae120dee6873229f83957bd7ed3477262aea9e400536e87f3edc91ccfe1b9
/* eslint-disable */
/**
 * This file was automatically generated from src/scenes/*.schema.json
 * using json-schema-to-typescript.
 * Do not manually edit this file — edit the .schema.json files instead,
 * then regenerate.
 */

export interface Agreement {
  /**
   * @minItems 2
   */
  tokens: [string, string, ...string[]];
  subject: number;
  verb: number;
  wrong: string;
  correct: string;
  why: string;
  labels: {
    subject: string;
    verb: string;
  };
}

export interface Transform {
  /**
   * @minItems 1
   */
  steps: [
    {
      tag: string;
      /**
       * @minItems 1
       */
      tokens: [string, ...string[]];
      hi: number[];
    },
    ...{
      tag: string;
      /**
       * @minItems 1
       */
      tokens: [string, ...string[]];
      hi: number[];
    }[]
  ];
}
