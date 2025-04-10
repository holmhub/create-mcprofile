import { select, text } from '@clack/prompts';

export async function selectRAMAllocation(): Promise<string> {
	let ram = (await select({
		message: 'Select RAM allocation',
		options: [
			{ value: '2G', label: '2GB (Vanilla/Light Modpacks)' },
			{ value: '4G', label: '4GB (Medium Modpacks)' },
			{ value: '6G', label: '6GB (Heavy Modpacks)' },
			{ value: '8G', label: '8GB (Expert Modpacks)' },
			{ value: 'custom', label: 'Custom Amount' },
		],
	})) as string;

	if (ram === 'custom') {
		ram = (await text({
			message: 'Enter RAM amount (in GB)',
			placeholder: '4',
			validate(value) {
				const num = Number.parseInt(value);
				if (Number.isNaN(num)) return 'Please enter a valid number';
				if (num < 1) return 'Minimum 1GB required';
				if (num > 32) return 'Maximum 32GB allowed';
				return;
			},
		})) as string;
		ram = `${ram}G`;
	}

	return ram as string;
}
