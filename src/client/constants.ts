import { EventEmitter } from 'node:events';

export const client = new EventEmitter();

export const DEFAULT_URLS = {
	meta: 'https://launchermeta.mojang.com',
	resource: 'https://resources.download.minecraft.net',
	mavenForge: 'https://files.minecraftforge.net/maven/',
	defaultRepoForge: 'https://libraries.minecraft.net/',
	fallbackMaven: 'https://search.maven.org/remotecontent?filepath=',
} as const;
