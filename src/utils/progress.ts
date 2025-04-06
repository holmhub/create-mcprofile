interface DownloadProgress {
	type: string;
	task: number;
	total: number;
}

const formatBytes = (bytes: number): string => {
	const sizes = ['B', 'KB', 'MB', 'GB'];
	if (bytes === 0) return '0 B';
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	return `${(bytes / 1024 ** i).toFixed(2)} ${sizes[i]}`;
};

export const handleProgress = (e: DownloadProgress): void => {
	const percent = Math.floor((e.task / e.total) * 100);
	const width = 30;
	const filled = Math.floor((width * percent) / 100);
	const bar = '█'.repeat(filled) + '░'.repeat(width - filled);

	process.stdout.write(
		`\r${e.type} [${bar}] ${percent}% | ${formatBytes(e.task)}/${formatBytes(e.total)}`,
	);

	if (percent === 100) {
		process.stdout.write('\n');
	}
};
