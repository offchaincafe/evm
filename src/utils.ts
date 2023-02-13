import { ethers } from "ethers";

export async function timeout(
  ms: number,
  promise: Promise<any>,
  message?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      reject(new Error(message || "Timeout"));
    }, ms);

    promise.then(resolve, reject);
  });
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function toBuffer(
  value: Parameters<typeof ethers.utils.arrayify>[0]
): Buffer {
  return Buffer.from(ethers.utils.arrayify(value));
}

export function toHex(
  value: Parameters<typeof ethers.utils.hexlify>[0]
): string {
  return ethers.utils.hexlify(value);
}

/**
 * @example
 * return ternaryPipe(
 *   () =>
 *     db
 *       .prepare(`SELECT address FROM profiles WHERE id = ?`)
 *       .pluck()
 *       .get(input.id),
 *   (val) => Address.from(val).toString(),
 *   () => null
 * ) satisfies string | null;
 */
export async function ternaryPipe<T, U, V>(
  pre: PromiseLike<T>,
  truthy: (val: NonNullable<Awaited<T>>) => U,
  falsey: (val: Awaited<T>) => V = () => null as V
): Promise<U | V> {
  const val = await pre;
  if (val) return truthy(val);
  return falsey(val);
}

export class GenericError<T> extends Error {
  constructor(message?: string, public readonly value?: T) {
    super(message);
  }

  toString(): string {
    return `${this.message} ${this.value}`;
  }
}

export function raise(e: Error): never {
  throw e;
}
