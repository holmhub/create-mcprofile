import type { LoaderType } from '@/cli/types.ts';
import { formatInColumns } from '@/cli/utils/format.ts';
import { getFabricLoaderVersions } from '@/client/loaders/fabric.ts';
import { getForgeLoaderVersions } from '@/client/loaders/forge.ts';
import { confirm, note, text } from '@clack/prompts';

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
		autocomplete: versions,
		validate(value) {
			if (!value) return 'Version number is required';
			if (!versions.includes(value)) return 'Version not found in manifest';
		},
	})) as string;
}

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
