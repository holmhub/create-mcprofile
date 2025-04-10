export type LoaderType = 'vanilla' | 'fabric' | 'forge' | 'quilt';

export type LauncherSettings = {
	Name: string;
	GameDirectory: string;
	ProfilesDirectory: string;
};

export type ProfileSettings = {
	Version: string;
	LoaderManifest?: string;
	RAM: string;
};
