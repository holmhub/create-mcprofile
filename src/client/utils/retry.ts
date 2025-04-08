/**
 * Retries an async operation with exponential backoff
 * @param operation The async operation to retry
 * @param retries Number of retry attempts (default: 3)
 * @param delay Initial delay in milliseconds (default: 1000)
 */
export async function withRetry<T>(
	operation: () => Promise<T>,
	retries = 3,
	delay = 1000
): Promise<T> {
	try {
		return await operation();
	} catch (error) {
		if (retries > 0) {
			await new Promise((resolve) => setTimeout(resolve, delay));
			return withRetry(operation, retries - 1, delay * 2);
		}
		throw error;
	}
}
