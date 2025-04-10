import type { LoaderType } from '@/cli/types.ts';
import { formatInColumns } from '@/cli/utils/format.ts';
import { getAvailableVersions } from '@/client/loaders/fabric';
import { confirm, note, text } from '@clack/prompts';

export async function getLoader(
	loaderType: LoaderType
): Promise<string | undefined> {
	if (loaderType !== 'fabric') return;

	const fabricVersions = await getAvailableVersions();
	const filteredVersions = fabricVersions.map((v) => v.version);

	const latestVersion = await confirm({
		message: 'Use recommended Fabric loader version?',
		initialValue: true,
		active: 'Yes',
		inactive: 'No',
	});

	if (latestVersion) {
		return filteredVersions[0];
	}

	note(
		formatInColumns(filteredVersions, {
			columns: 5,
			header: '📦 Available Fabric Versions:',
			padding: 15,
		})
	);

	return (await text({
		message: 'Select Fabric version',
		placeholder: filteredVersions[0],
		validate(value) {
			if (!value) return 'Version number is required';
			if (!filteredVersions.includes(value))
				return 'Version not found in manifest';
		},
	})) as string;
}
