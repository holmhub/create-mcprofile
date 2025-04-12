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

const createProgressBar = (current: number, total: number, width = 30) => {
	const percent = Math.floor((current / total) * 100);
	const filled = Math.floor((width * percent) / 100);
	const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
	return { percent, bar };
};

const formatSize = (bytes: number): string => {
	return (bytes / 1048576).toFixed(1);
};

export const handleProgress = (e: ProgressEvent): void => {
	const { percent, bar } = createProgressBar(e.task, e.total);
	process.stdout.write(
		`\r${e.type} [${bar}] ${percent}% | ${e.task}/${e.total} files`
	);
	if (e.task === e.total) {
		process.stdout.write('\n');
	}
};

export const handleDownloadStatus = (e: DownloadStatusEvent): void => {
	const { percent, bar } = createProgressBar(e.current, e.total);
	const size = `${formatSize(e.current)}/${formatSize(e.total)} MB`;
	process.stdout.write(`\r${e.type} [${bar}] ${percent}% | ${size}`);
	if (e.current === e.total) {
		process.stdout.write('\n');
	}
};

export const handleExtractStatus = (e: ProgressEvent): void => {
	const { percent, bar } = createProgressBar(e.task, e.total);
	const size = `${formatSize(e.task)}/${formatSize(e.total)} MB`;
	process.stdout.write(`\r${e.type} [${bar}] ${percent}% | ${size}`);
	if (e.task === e.total) {
		process.stdout.write('\n');
	}
};
