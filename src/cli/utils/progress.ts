interface ProgressEvent {
	type: string;
	task: number;
	total: number;
}

interface DownloadStatusEvent {
	name: string;
	type: string;
	current: number;
	total: number;
}

export const handleProgress = (e: ProgressEvent): void => {
	const percent = Math.floor((e.task / e.total) * 100);
	const width = 30;
	const filled = Math.floor((width * percent) / 100);
	const bar = '█'.repeat(filled) + '░'.repeat(width - filled);

	process.stdout.write(
		`\r${e.type} [${bar}] ${percent}% | ${e.task}/${e.total} files`
	);

	if (e.task === e.total) {
		process.stdout.write('\n');
	}
};

export const handleDownloadStatus = (e: DownloadStatusEvent): void => {
	const percent = Math.floor((e.current / e.total) * 100);
	const width = 30;
	const filled = Math.floor((width * percent) / 100);
	const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
	const size = `${(e.current / 1048576).toFixed(1)}/${(e.total / 1048576).toFixed(1)} MB`;

	process.stdout.write(`\r${e.type} [${bar}] ${percent}% | ${size}`);

	if (e.current === e.total) {
		process.stdout.write('\n');
	}
};
