export interface VersionManifest {
	latest: {
		release: string;
		snapshot: string;
	};
	versions: VersionInfo[];
}

export interface VersionInfo {
	id: string;
	type: 'release' | 'snapshot';
	url: string;
	time: string;
	releaseTime: string;
}
