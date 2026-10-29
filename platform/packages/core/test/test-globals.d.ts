// Web APIs only core's tests use: randomness and deep copies for the in-memory
// twin. Kept out of src/, which takes its randomness as an argument (purity.test.ts).
interface Crypto {
  getRandomValues<T extends Uint8Array>(array: T): T;
  randomUUID(): string;
}

declare function structuredClone<T>(value: T): T;
