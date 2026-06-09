import * as ecc from '../../src/lib/secp256k1-compat'

describe('secp256k1-compat', () => {
  // Test vectors
  const validPrivateKey = Buffer.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex')
  const validPublicKeyCompressed = Buffer.from('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', 'hex')
  const validPublicKeyUncompressed = Buffer.from('0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8', 'hex')

  describe('isPoint', () => {
    it('should return true for valid compressed public key', () => {
      expect(ecc.isPoint(validPublicKeyCompressed)).toBe(true)
    })

    it('should return true for valid uncompressed public key', () => {
      expect(ecc.isPoint(validPublicKeyUncompressed)).toBe(true)
    })

    it('should return false for invalid public key', () => {
      const invalidKey = Buffer.alloc(33, 0)
      expect(ecc.isPoint(invalidKey)).toBe(false)
    })

    it('should return false for null/undefined', () => {
      expect(ecc.isPoint(null)).toBe(false)
      expect(ecc.isPoint(undefined)).toBe(false)
    })
  })

  describe('isPointCompressed', () => {
    it('should return true for compressed public key', () => {
      expect(ecc.isPointCompressed(validPublicKeyCompressed)).toBe(true)
    })

    it('should return false for uncompressed public key', () => {
      expect(ecc.isPointCompressed(validPublicKeyUncompressed)).toBe(false)
    })
  })

  describe('isPrivate', () => {
    it('should return true for valid private key', () => {
      expect(ecc.isPrivate(validPrivateKey)).toBe(true)
    })

    it('should return false for zero', () => {
      const zero = Buffer.alloc(32, 0)
      expect(ecc.isPrivate(zero)).toBe(false)
    })

    it('should return false for wrong length', () => {
      const wrongLength = Buffer.alloc(31, 1)
      expect(ecc.isPrivate(wrongLength)).toBe(false)
    })
  })

  describe('pointFromScalar', () => {
    it('should derive public key from private key', () => {
      const publicKey = ecc.pointFromScalar(validPrivateKey, true)
      expect(publicKey).not.toBeNull()
      expect(Buffer.from(publicKey!).toString('hex')).toBe(validPublicKeyCompressed.toString('hex'))
    })

    it('should return uncompressed key when compressed is false', () => {
      const publicKey = ecc.pointFromScalar(validPrivateKey, false)
      expect(publicKey).not.toBeNull()
      expect(publicKey).toHaveLength(65)
    })

    it('should return null for invalid private key', () => {
      const invalid = Buffer.alloc(32, 0)
      expect(ecc.pointFromScalar(invalid)).toBeNull()
    })
  })

  describe('pointCompress', () => {
    it('should compress uncompressed public key', () => {
      const compressed = ecc.pointCompress(validPublicKeyUncompressed, true)
      expect(compressed).not.toBeNull()
      expect(Buffer.from(compressed!).toString('hex')).toBe(validPublicKeyCompressed.toString('hex'))
    })

    it('should decompress compressed public key', () => {
      const uncompressed = ecc.pointCompress(validPublicKeyCompressed, false)
      expect(uncompressed).not.toBeNull()
      expect(uncompressed).toHaveLength(65)
    })
  })

  describe('sign and verify', () => {
    const messageHash = Buffer.alloc(32, 1)

    it('should sign a message hash', () => {
      const signature = ecc.sign(messageHash, validPrivateKey)
      expect(signature).not.toBeNull()
      expect(signature).toHaveLength(64)
    })

    it('should verify a valid signature', () => {
      const signature = ecc.sign(messageHash, validPrivateKey)
      const isValid = ecc.verify(messageHash, validPublicKeyCompressed, signature!)
      expect(isValid).toBe(true)
    })

    it('should reject invalid signature', () => {
      const fakeSignature = Buffer.alloc(64, 0)
      const isValid = ecc.verify(messageHash, validPublicKeyCompressed, fakeSignature)
      expect(isValid).toBe(false)
    })
  })

  describe('privateAdd', () => {
    it('should add two private keys', () => {
      const tweak = Buffer.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex')
      const result = ecc.privateAdd(validPrivateKey, tweak)
      expect(result).not.toBeNull()
      expect(Buffer.from(result!).toString('hex')).toBe('0000000000000000000000000000000000000000000000000000000000000002')
    })
  })

  describe('pointAddScalar', () => {
    it('should add scalar to point', () => {
      const tweak = Buffer.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex')
      const result = ecc.pointAddScalar(validPublicKeyCompressed, tweak, true)
      expect(result).not.toBeNull()
      expect(result).toHaveLength(33)
    })

    it('should return same point for zero tweak', () => {
      const zeroTweak = Buffer.alloc(32, 0)
      const result = ecc.pointAddScalar(validPublicKeyCompressed, zeroTweak, true)
      expect(result).not.toBeNull()
      expect(Buffer.from(result!).toString('hex')).toBe(validPublicKeyCompressed.toString('hex'))
    })
  })

  describe('pointAdd', () => {
    it('should add two points', () => {
      const result = ecc.pointAdd(validPublicKeyCompressed, validPublicKeyCompressed, true)
      expect(result).not.toBeNull()
      expect(result).toHaveLength(33)
    })
  })

  describe('pointMultiply', () => {
    it('should multiply point by scalar', () => {
      const scalar = Buffer.from('0000000000000000000000000000000000000000000000000000000000000002', 'hex')
      const result = ecc.pointMultiply(validPublicKeyCompressed, scalar, true)
      expect(result).not.toBeNull()
      expect(result).toHaveLength(33)
    })
  })

  describe('hex string validation', () => {
    it('should reject invalid hex characters', () => {
      expect(() => ecc.isPoint('invalidhexstring!')).toThrow('Invalid hex string')
    })

    it('should reject odd-length hex string', () => {
      expect(() => ecc.isPoint('abc')).toThrow('Hex string must have even length')
    })

    it('should accept valid hex string with 0x prefix', () => {
      // This should not throw, though isPoint will return false for short data
      expect(() => ecc.isPoint('0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798')).not.toThrow()
    })
  })
})
