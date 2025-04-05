import { Authenticator, Client, type ILauncherOptions } from 'minecraft-launcher-core';
import { join } from 'path';
import { createInterface } from 'readline';
import { displayVersions, getVersions } from './versions';
import { readdirSync, existsSync, mkdirSync } from 'fs';

const launcher = new Client();

const rl = createInterface({
    input: process.stdin,
    output: process.stdout
});

async function askQuestion(query: string): Promise<string> {
    return new Promise(resolve => rl.question(query, resolve));
}

const PROFILES_PATH = join(process.env.APPDATA || '', 'ModrinthApp', 'profiles');

function getProfiles(): string[] {
    try {
        // Create profiles directory if it doesn't exist
        if (!existsSync(PROFILES_PATH)) {
            mkdirSync(PROFILES_PATH, { recursive: true });
            return [];
        }

        // Read and return directory names
        return readdirSync(PROFILES_PATH, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
    } catch (error) {
        console.error('Error reading profiles:', error);
        return [];
    }
}

async function main(): Promise<void> {
    try {
        // Get username
        const username = await askQuestion('Enter username: ');

        // Get available profiles
        console.log('\nAvailable profiles:');
        const profiles = getProfiles();
        
        let selectedProfile: string;
        if (profiles.length > 0) {
            profiles.forEach((profile, index) => {
                console.log(`${index + 1}. ${profile}`);
            });
            console.log(`${profiles.length + 1}. Create new profile`);
            
            const profileChoice = parseInt(await askQuestion('Select profile number: '));
            if (profileChoice === profiles.length + 1) {
                selectedProfile = await askQuestion('Enter new profile name: ');
                mkdirSync(join(PROFILES_PATH, selectedProfile), { recursive: true });
            } else if (profileChoice > 0 && profileChoice <= profiles.length) {
                selectedProfile = profiles[profileChoice - 1] || '';
            } else {
                throw new Error('Invalid profile selected');
            }
        } else {
            selectedProfile = await askQuestion('No profiles found. Enter new profile name: ');
            mkdirSync(join(PROFILES_PATH, selectedProfile), { recursive: true });
        }
        
        console.log(`\nSelected profile: ${selectedProfile}`);

        // Get available versions
        console.log('\nAvailable versions:');
        console.log('1. Release');
        console.log('2. Snapshot');
        const versionType = await askQuestion('Select version type (1/2): ');

        // Fetch and display versions
        const versions = await getVersions(versionType === '2');
        await displayVersions(versions);

        // Get version selection
        const versionChoice = parseInt(await askQuestion('Select version number: ')) - 1;
        const selectedVersion = versions[versionChoice];

        if (!selectedVersion) {
            throw new Error('Invalid version selected');
        }

        console.log(`\nSelected version: ${selectedVersion.id}`);

        const opts: ILauncherOptions = {
            clientPackage: undefined,
            authorization: Authenticator.getAuth(username),
            root: join(process.env.APPDATA || '', '.minecraft'),
            version: {
                number: selectedVersion.id,
                type: selectedVersion.type,
                custom: "fabric-loader-0.16.12-1.20.1"
            },
            memory: {
                max: "4G",
                min: "2G"
            },
            overrides: {
                maxSockets: 4,
                gameDirectory: join(PROFILES_PATH, selectedProfile)
            }
        };

        console.log('Launching Minecraft...');
        launcher.launch({
            ...opts,
            clientPackage: undefined
        });

        launcher.on('debug', console.log);
        launcher.on('data', console.log);
        launcher.on('progress', (e: { type: string; task: string; total: number }) => {
            console.log(`Download progress: ${e.type} | ${e.task} | ${e.total}`);
        });

    } catch (error) {
        console.error('Error launching Minecraft:', error);
    }
}

main().finally(() => rl.close());