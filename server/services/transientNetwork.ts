function toErrorText(error: unknown) {
  if (error instanceof Error) {
    const cause =
      typeof error.cause === 'string'
        ? error.cause
        : error.cause instanceof Error
          ? `${error.cause.name}: ${error.cause.message}`
          : ''
    return `${error.name}: ${error.message}${cause ? ` ${cause}` : ''}`
  }

  return String(error)
}

export function isTransientNetworkError(error: unknown) {
  const text = toErrorText(error).toLowerCase()
  return (
    text.includes('fetch failed') ||
    text.includes('failed to fetch') ||
    text.includes('econnreset') ||
    text.includes('etimedout') ||
    text.includes('eai_again') ||
    text.includes('enotfound') ||
    text.includes('econnrefused') ||
    text.includes('socket hang up') ||
    text.includes('networkerror') ||
    text.includes('und_err_') ||
    text.includes('this operation was aborted') ||
    /(?:request failed with|failed to fetch [^:]+:)\s*(408|425|429|500|502|503|504)\b/.test(text)
  )
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export type RetryOptions = {
  attempts?: number
  initialDelayMs?: number
}

export async function retryTransient<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 3
  const initialDelayMs = options.initialDelayMs ?? 400
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (!isTransientNetworkError(error) || attempt >= attempts) {
        throw error
      }

      await sleep(initialDelayMs * attempt)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Transient operation failed')
}

export async function retryTransientResult<T>(
  operation: () => Promise<T>,
  shouldRetryResult: (result: T) => boolean,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 3
  const initialDelayMs = options.initialDelayMs ?? 400
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await operation()
      if (!shouldRetryResult(result) || attempt >= attempts) {
        return result
      }

      await sleep(initialDelayMs * attempt)
    } catch (error) {
      lastError = error
      if (!isTransientNetworkError(error) || attempt >= attempts) {
        throw error
      }

      await sleep(initialDelayMs * attempt)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Retryable operation failed')
}
