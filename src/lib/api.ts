const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim()

export function buildApiUrl(path: string) {
  if (!API_BASE_URL) {
    return path
  }

  return new URL(path, API_BASE_URL).toString()
}
