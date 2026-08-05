import {
  getExplorerApiUrl,
  getExplorerWebUrl,
  setExplorerUrls,
} from '~/core/config/explorer'

const MAINNET = {
  apiUrl: 'https://explorer.api.tapyrus.chaintope.com/api',
  webUrl: 'https://explorer.api.tapyrus.chaintope.com',
}

describe('config/explorer', () => {
  describe('setExplorerUrls', () => {
    it('should return the injected urls', () => {
      setExplorerUrls(MAINNET)
      expect(getExplorerApiUrl()).toBe(MAINNET.apiUrl)
      expect(getExplorerWebUrl()).toBe(MAINNET.webUrl)
    })

    it('should overwrite previously injected urls', () => {
      setExplorerUrls(MAINNET)
      setExplorerUrls({
        apiUrl: 'https://testnet-explorer.tapyrus.dev.chaintope.com/api',
        webUrl: 'https://testnet-explorer.tapyrus.dev.chaintope.com',
      })
      expect(getExplorerApiUrl()).toBe(
        'https://testnet-explorer.tapyrus.dev.chaintope.com/api',
      )
    })

    // Every call site appends a path starting with "/", so a stored trailing
    // slash would produce "//address/...".
    it('should drop trailing slashes and surrounding whitespace', () => {
      setExplorerUrls({ apiUrl: '  https://example.com/api//  ', webUrl: 'https://example.com/' })
      expect(getExplorerApiUrl()).toBe('https://example.com/api')
      expect(getExplorerWebUrl()).toBe('https://example.com')
    })

    it('should reject a url without a scheme', () => {
      expect(() =>
        setExplorerUrls({ apiUrl: 'example.com/api', webUrl: MAINNET.webUrl }),
      ).toThrow(/Invalid explorer apiUrl/)
    })

    it('should reject a non-http scheme', () => {
      expect(() =>
        setExplorerUrls({ apiUrl: MAINNET.apiUrl, webUrl: 'ftp://example.com' }),
      ).toThrow(/Invalid explorer webUrl/)
    })

    it('should reject an empty url', () => {
      expect(() =>
        setExplorerUrls({ apiUrl: '', webUrl: MAINNET.webUrl }),
      ).toThrow(/Invalid explorer apiUrl/)
    })

    // A rejected call must not leave core pointing at half of a network.
    it('should leave the previous urls untouched when one url is invalid', () => {
      setExplorerUrls(MAINNET)
      expect(() =>
        setExplorerUrls({ apiUrl: 'https://example.com/api', webUrl: 'nope' }),
      ).toThrow()
      expect(getExplorerApiUrl()).toBe(MAINNET.apiUrl)
      expect(getExplorerWebUrl()).toBe(MAINNET.webUrl)
    })
  })

  // The injected urls live in module state, so observing the default requires a
  // fresh copy of the module.
  it('should default to the testnet explorer when the host injects nothing', () => {
    jest.resetModules()
    const fresh = require('~/core/config/explorer') as typeof import('~/core/config/explorer')
    expect(fresh.getExplorerApiUrl()).toBe(
      'https://testnet-explorer.tapyrus.dev.chaintope.com/api',
    )
    expect(fresh.getExplorerWebUrl()).toBe(
      'https://testnet-explorer.tapyrus.dev.chaintope.com',
    )
  })
})
