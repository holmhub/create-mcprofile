export type LauncherSettings = {
	Name: string;
	GameDirectory: string;
	ProfilesDirectory: string;
};

export type ProfileSettings = {
	Version: string;
	Loader: 'vanilla' | 'fabric' | 'forge' | 'quilt';
	RAM: string;
};
