// Compatibility layer for tiny-secp256k1 using @noble/secp256k1 v2
// This provides a pure JavaScript implementation that works in browser extensions

import * as secp from "@noble/secp256k1";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";

// Set up HMAC for synchronous signing (required by @noble/secp256k1 v2)
secp.etc.hmacSha256Sync = (k, ...m) => hmac(sha256, k, secp.etc.concatBytes(...m));

// The curve order for secp256k1
const CURVE_ORDER = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;

// Initialize (no-op for noble, but required by tiny-secp256k1 interface)
export function __initializeContext() {}

// Helper function to ensure Uint8Array
function toUint8Array(data) {
  if (data instanceof Uint8Array) return data;
  if (Buffer.isBuffer(data)) return new Uint8Array(data);
  if (Array.isArray(data)) return new Uint8Array(data);
  if (typeof data === 'string') {
    // Assume hex string
    const hex = data.replace(/^0x/, '');
    // Validate hex string
    if (!/^[0-9a-fA-F]*$/.test(hex)) {
      throw new Error('Invalid hex string');
    }
    if (hex.length % 2 !== 0) {
      throw new Error('Hex string must have even length');
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }
  return data;
}

// Helper function to convert bytes to BigInt
function bytesToBigInt(bytes) {
  const arr = toUint8Array(bytes);
  let result = 0n;
  for (const byte of arr) {
    result = (result << 8n) + BigInt(byte);
  }
  return result;
}

// Helper function to convert BigInt to Uint8Array (32 bytes)
function bigIntToBytes(num, length = 32) {
  const bytes = new Uint8Array(length);
  let n = num;
  for (let i = length - 1; i >= 0; i--) {
    bytes[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return bytes;
}

// Check if a buffer is a valid public key point
export function isPoint(p) {
  if (!p) return false;
  const arr = toUint8Array(p);
  if (arr.length !== 33 && arr.length !== 65) return false;
  try {
    secp.Point.fromHex(arr);
    return true;
  } catch {
    return false;
  }
}

// Check if point is compressed (33 bytes)
export function isPointCompressed(p) {
  if (!p) return false;
  const arr = toUint8Array(p);
  return arr.length === 33 && (arr[0] === 0x02 || arr[0] === 0x03);
}

// Check if a buffer is a valid private key
export function isPrivate(d) {
  if (!d) return false;
  const arr = toUint8Array(d);
  if (arr.length !== 32) return false;
  const num = bytesToBigInt(arr);
  return num > 0n && num < CURVE_ORDER;
}

// Get public key from private key
export function pointFromScalar(d, compressed = true) {
  const arr = toUint8Array(d);
  if (!isPrivate(arr)) return null;
  try {
    return secp.getPublicKey(arr, compressed);
  } catch {
    return null;
  }
}

// Compress or decompress a point
export function pointCompress(p, compressed = true) {
  try {
    const arr = toUint8Array(p);
    const point = secp.Point.fromHex(arr);
    return point.toRawBytes(compressed);
  } catch {
    return null;
  }
}

// Add a scalar to a point
export function pointAddScalar(p, tweak, compressed = true) {
  try {
    const pArr = toUint8Array(p);
    const tweakArr = toUint8Array(tweak);
    const point = secp.Point.fromHex(pArr);
    const tweakNum = bytesToBigInt(tweakArr);
    if (tweakNum === 0n) return new Uint8Array(point.toRawBytes(compressed));
    if (tweakNum >= CURVE_ORDER) return null;
    const tweakPoint = secp.Point.fromPrivateKey(tweakArr);
    const result = point.add(tweakPoint);
    return result.toRawBytes(compressed);
  } catch {
    return null;
  }
}

// Add two private keys
export function privateAdd(d, tweak) {
  try {
    const dArr = toUint8Array(d);
    const tweakArr = toUint8Array(tweak);
    const dNum = bytesToBigInt(dArr);
    const tweakNum = bytesToBigInt(tweakArr);
    let result = (dNum + tweakNum) % CURVE_ORDER;
    if (result === 0n) return null;
    return bigIntToBytes(result);
  } catch {
    return null;
  }
}

// Subtract two private keys
export function privateSub(d, tweak) {
  try {
    const dArr = toUint8Array(d);
    const tweakArr = toUint8Array(tweak);
    const dNum = bytesToBigInt(dArr);
    const tweakNum = bytesToBigInt(tweakArr);
    let result = dNum - tweakNum;
    if (result < 0n) result += CURVE_ORDER;
    result = result % CURVE_ORDER;
    if (result === 0n) return null;
    return bigIntToBytes(result);
  } catch {
    return null;
  }
}

// Negate a private key
export function privateNegate(d) {
  const dArr = toUint8Array(d);
  const dNum = bytesToBigInt(dArr);
  if (dNum === 0n) return bigIntToBytes(0n);
  const result = CURVE_ORDER - dNum;
  return bigIntToBytes(result);
}

// Sign a message hash with a private key (returns 64-byte compact signature)
// Note: tiny-secp256k1 uses lowS: true by default
export function sign(h, d, e) {
  try {
    const hArr = toUint8Array(h);
    const dArr = toUint8Array(d);
    const sig = secp.sign(hArr, dArr, { lowS: true });
    return sig.toCompactRawBytes();
  } catch (err) {
    console.error("Sign error:", err);
    return null;
  }
}

// Verify a signature
export function verify(h, Q, signature, strict = false) {
  try {
    const hArr = toUint8Array(h);
    const qArr = toUint8Array(Q);
    const sigArr = toUint8Array(signature);
    // Use lowS: false for verify to accept both low and high S values
    return secp.verify(sigArr, hArr, qArr, { lowS: false });
  } catch {
    return false;
  }
}

// Add two points
export function pointAdd(pA, pB, compressed = true) {
  try {
    const aArr = toUint8Array(pA);
    const bArr = toUint8Array(pB);
    const a = secp.Point.fromHex(aArr);
    const b = secp.Point.fromHex(bArr);
    const result = a.add(b);
    return result.toRawBytes(compressed);
  } catch {
    return null;
  }
}

// Multiply a point by a scalar
export function pointMultiply(p, tweak, compressed = true) {
  try {
    const pArr = toUint8Array(p);
    const tweakArr = toUint8Array(tweak);
    const point = secp.Point.fromHex(pArr);
    const scalar = bytesToBigInt(tweakArr);
    if (scalar === 0n || scalar >= CURVE_ORDER) return null;
    return point.multiply(scalar).toRawBytes(compressed);
  } catch {
    return null;
  }
}

// Default export for compatibility
export default {
  __initializeContext,
  isPoint,
  isPointCompressed,
  isPrivate,
  pointFromScalar,
  pointCompress,
  pointAddScalar,
  privateAdd,
  privateSub,
  privateNegate,
  sign,
  verify,
  pointAdd,
  pointMultiply,
};
