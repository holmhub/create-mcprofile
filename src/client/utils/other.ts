/**
 * Extracts a readable message from any error
 */
export function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Cleans up an array or object by:
 * 1. Removing null values
 * 2. Removing duplicate values
 * 3. Converting object values to array if needed
 *
 * @template T The type of elements in the array or object
 * @param array Input array or object with values of type T
 * @returns A new array with unique, non-null values
 *
 * @example
 * // With array input
 * getUniqueNonNullValues([1, 2, 2, null, 3]) // => [1, 2, 3]
 *
 * // With object input
 * getUniqueNonNullValues({ a: 1, b: 1, c: null, d: 2 }) // => [1, 2]
 *
 * // With mixed types
 * getUniqueNonNullValues(['a', 'b', null, 'b']) // => ['a', 'b']
 */
export function getUniqueNonNullValues<T>(array: T[] | Record<string, T>): T[] {
	if (Array.isArray(array)) {
		return [
			...new Set(
				array.filter((value): value is NonNullable<T> => value !== null)
			),
		];
	}
	return [
		...new Set(
			Object.values(array).filter(
				(value): value is NonNullable<T> => value !== null
			)
		),
	];
}
