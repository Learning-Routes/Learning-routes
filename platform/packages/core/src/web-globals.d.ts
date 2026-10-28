// The standard Web APIs core relies on, which every host it runs on provides
// (Workers, Node 22, browsers). Declared here so core needs no platform typings.
declare const crypto: {
  subtle: { digest(algorithm: "SHA-256", data: Uint8Array): Promise<ArrayBuffer> };
};

declare class TextEncoder {
  encode(input: string): Uint8Array;
}
