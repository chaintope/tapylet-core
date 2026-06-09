/**
 * Sanitize URL to prevent XSS attacks via javascript: or data: URLs
 */
export const sanitizeUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined

  const trimmed = url.trim().toLowerCase()

  // Block dangerous URL schemes
  if (
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("vbscript:")
  ) {
    return undefined
  }

  // Only allow http, https, and ipfs URLs
  if (
    !trimmed.startsWith("http://") &&
    !trimmed.startsWith("https://") &&
    !trimmed.startsWith("ipfs://")
  ) {
    // If no scheme, assume https
    if (!trimmed.includes("://")) {
      return `https://${url.trim()}`
    }
    return undefined
  }

  return url.trim()
}

/**
 * Sanitize image URL - allows data: URLs for images only with safe mime types
 */
export const sanitizeImageUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined

  const trimmed = url.trim().toLowerCase()

  // Allow data URIs for images with safe mime types
  if (trimmed.startsWith("data:image/")) {
    const mimeMatch = trimmed.match(/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);/)
    if (mimeMatch) {
      return url.trim()
    }
    return undefined
  }

  // For other URLs, use standard sanitization
  return sanitizeUrl(url)
}
