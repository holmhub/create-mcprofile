interface DownloadProgress {
	type: string;
	task: number;
	total: number;
}

export const handleProgress = (e: DownloadProgress): void => {
	const percent = Math.floor((e.task / e.total) * 100);
	const width = 30;
	const filled = Math.floor((width * percent) / 100);
	const bar = '█'.repeat(filled) + '░'.repeat(width - filled);

	process.stdout.write(
		`\r${e.type} [${bar}] ${percent}% | ${e.task}/${e.total} files`,
	);

	if (percent === 100) {
		process.stdout.write('\n');
	}
};
