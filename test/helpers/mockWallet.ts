import * as tapyrus from 'tapyrusjs-lib'
import type { KeyPairWithNetwork } from '~/core/wallet/hdwallet'

// Common test mnemonic (BIP39 test vector)
export const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

// Valid Tapyrus prod addresses for testing
export const TEST_ADDRESS = '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH'
export const TEST_RECIPIENT = '1cMh228HTCiwS8ZsaakH8A8wze1JR5ZsP'

// Create mock keyPair from WIF
const MOCK_WIF = 'KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn'
const mockNetwork = tapyrus.networks.prod
const mockKeyPair = tapyrus.ECPair.fromWIF(MOCK_WIF, mockNetwork)

export const mockPublicKey = mockKeyPair.publicKey

// Mock KeyPairWithNetwork result for getKeyPairFromMnemonic
export const mockKeyPairWithNetwork: KeyPairWithNetwork = {
  keyPair: mockKeyPair,
  publicKey: mockPublicKey,
  network: mockNetwork,
}