/**
 * Extracts a readable message from any error
 */
export function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
