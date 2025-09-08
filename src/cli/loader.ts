import type { LoaderType } from '@/cli/types.ts';
import { formatInColumns } from '@/cli/utils/format.ts';
import { getFabricLoaderVersions } from '@/client/loaders/fabric.ts';
import { getForgeLoaderVersions } from '@/client/loaders/forge.ts';
import { confirm, note, text } from '@clack/prompts';

/**
 * Prompts the user to select a loader version for the specified loader type and Minecraft version.
 *
 * If the loader type is 'vanilla', returns `undefined`. Otherwise, offers the recommended (latest) loader version or allows manual selection from available versions.
 *
 * @param loaderType - The type of loader to use (e.g., 'fabric', 'forge').
 * @param mcVersion - The target Minecraft version.
 * @param root - The root directory for loader data.
 * @returns The selected loader version as a string, or `undefined` for 'vanilla' loader type.
 */
export async function getLoader(
	loaderType: LoaderType,
	mcVersion: string,
	root: string
): Promise<string | undefined> {
	if (loaderType === 'vanilla') return;

	const loaderName = loaderType.charAt(0).toUpperCase() + loaderType.slice(1);
	const versions = await getLoaderVersions(loaderType, root, mcVersion);
	const latestVersion = await confirm({
		message: `Use recommended ${loaderName} loader version?`,
	});

	if (latestVersion) {
		return versions[0];
	}

	note(
		formatInColumns(versions, {
			columns: 5,
			header: `📦 Available ${loaderName} Versions:`,
			padding: 15,
		})
	);

	return (await text({
		message: `Select ${loaderName} version`,
		placeholder: versions[0],
		// autocomplete: versions,
		validate(value) {
			if (!value) return 'Version number is required';
			if (!versions.includes(value)) return 'Version not found in manifest';
		},
	})) as string;
}

/**
 * Retrieves available loader versions for the specified loader type and Minecraft version.
 *
 * For 'fabric', returns a list of version strings fetched from the Fabric loader source.
 * For 'forge', returns a list of version strings fetched from the Forge loader source using the provided root path and Minecraft version.
 * For other loader types, returns an empty array.
 *
 * @param type - The loader type ('fabric', 'forge', etc.).
 * @param root - The root directory used for Forge loader version retrieval.
 * @param mcVersion - The target Minecraft version.
 * @returns An array of available loader version strings.
 */
async function getLoaderVersions(
	type: LoaderType,
	root: string,
	mcVersion: string
) {
	switch (type) {
		case 'fabric':
			return (await getFabricLoaderVersions()).map((v) => v.version);
		case 'forge':
			return getForgeLoaderVersions(root, mcVersion);
		default:
			return [];
	}
}
