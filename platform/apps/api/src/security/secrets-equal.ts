// Compares a secret or token in constant time (Platform STEP 2 §1.7): never ===,
// which stops at the first different character and leaks it through timing. Both
// values are hashed with Web Crypto to 32 bytes first, so a length difference
// leaks nothing either, and the digests are compared with a fold that always
// reads every byte. (crypto.subtle.timingSafeEqual exists only in Workers; this
// runs the same in Workers and in the Node tests.)
const encoder = new TextEncoder();

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

/** Whether two secrets are equal, in time that does not depend on where they differ. */
export async function secretsEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let difference = 0;
  for (let i = 0; i < x.length; i++) {
    difference |= (x[i] as number) ^ (y[i] as number);
  }
  return difference === 0;
}
