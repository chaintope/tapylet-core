import {
  generateMnemonic,
  validateMnemonic,
  mnemonicToSeed,
  normalizeMnemonic,
  mnemonicToWords,
  wordsToMnemonic,
} from '~/core/wallet/mnemonic'

describe('mnemonic', () => {
  const validMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

  describe('generateMnemonic', () => {
    it('should generate a 12-word mnemonic by default', () => {
      const mnemonic = generateMnemonic()
      const words = mnemonic.split(' ')
      expect(words).toHaveLength(12)
    })

    it('should generate a 24-word mnemonic with strength 256', () => {
      const mnemonic = generateMnemonic(256)
      const words = mnemonic.split(' ')
      expect(words).toHaveLength(24)
    })

    it('should generate a valid mnemonic', () => {
      const mnemonic = generateMnemonic()
      expect(validateMnemonic(mnemonic)).toBe(true)
    })
  })

  describe('validateMnemonic', () => {
    it('should return true for valid mnemonic', () => {
      expect(validateMnemonic(validMnemonic)).toBe(true)
    })

    it('should return false for invalid mnemonic', () => {
      expect(validateMnemonic('invalid mnemonic phrase')).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(validateMnemonic('')).toBe(false)
    })

    it('should handle extra whitespace', () => {
      const mnemonicWithSpaces = '  abandon  abandon   abandon abandon abandon abandon abandon abandon abandon abandon abandon about  '
      expect(validateMnemonic(mnemonicWithSpaces)).toBe(true)
    })

    it('should handle uppercase', () => {
      const uppercaseMnemonic = validMnemonic.toUpperCase()
      expect(validateMnemonic(uppercaseMnemonic)).toBe(true)
    })
  })

  describe('mnemonicToSeed', () => {
    it('should generate a 64-byte seed', async () => {
      const seed = await mnemonicToSeed(validMnemonic)
      expect(seed).toHaveLength(64)
    })

    it('should generate consistent seed for same mnemonic', async () => {
      const seed1 = await mnemonicToSeed(validMnemonic)
      const seed2 = await mnemonicToSeed(validMnemonic)
      expect(seed1.equals(seed2)).toBe(true)
    })

    it('should generate known seed for test vector', async () => {
      const seed = await mnemonicToSeed(validMnemonic)
      const expectedHex = '5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4'
      expect(seed.toString('hex')).toBe(expectedHex)
    })
  })

  describe('normalizeMnemonic', () => {
    it('should trim whitespace', () => {
      expect(normalizeMnemonic('  word1 word2  ')).toBe('word1 word2')
    })

    it('should convert to lowercase', () => {
      expect(normalizeMnemonic('WORD1 WORD2')).toBe('word1 word2')
    })

    it('should normalize multiple spaces', () => {
      expect(normalizeMnemonic('word1   word2    word3')).toBe('word1 word2 word3')
    })
  })

  describe('mnemonicToWords', () => {
    it('should split mnemonic into words array', () => {
      const words = mnemonicToWords(validMnemonic)
      expect(words).toHaveLength(12)
      expect(words[0]).toBe('abandon')
      expect(words[11]).toBe('about')
    })
  })

  describe('wordsToMnemonic', () => {
    it('should join words into mnemonic string', () => {
      const words = ['word1', 'word2', 'word3']
      expect(wordsToMnemonic(words)).toBe('word1 word2 word3')
    })
  })
})
