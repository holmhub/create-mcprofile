import { withRetry } from './other.ts';
import { parseXMLString, type XMLNode } from './xmlparser.ts';

/**
 * Fetches and parses JSON data from a given URL
 * @template T The expected type of the JSON response
 * @param url The URL to fetch from
 * @throws {Error} If the HTTP response is not OK or if JSON parsing fails
 * @returns {Promise<T>} Promise resolving to the parsed JSON data
 */
export async function fetchJson<T>(url: string): Promise<T> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`);
	}
	return response.json() as Promise<T>;
}

/**
 * Fetches JSON data with automatic retry capability
 * @template T The expected type of the JSON response
 * @param url The URL to fetch from
 * @param retries Maximum number of retry attempts (default: 3)
 * @param delay Initial delay in milliseconds between retries (default: 1000)
 * @returns {Promise<T>} Promise resolving to the parsed JSON data
 */
export function fetchJsonWithRetry<T>(
	url: string,
	retries = 3,
	delay = 1000
): Promise<T> {
	return withRetry(() => fetchJson<T>(url), retries, delay);
}

/**
 * Fetches and parses XML data from a given URL
 */
export async function fetchXml(url: string): Promise<XMLNode> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`);
	}
	const text = await response.text();
	return parseXMLString(text);
}

/**
 * Fetches XML data with automatic retry capability
 */
export function fetchXmlWithRetry(
	url: string,
	retries = 3,
	delay = 1000
): Promise<XMLNode> {
	return withRetry(() => fetchXml(url), retries, delay);
}
