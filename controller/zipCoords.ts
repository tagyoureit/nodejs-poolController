import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../logger/Logger';

let _zipData: { [zip: string]: [number, number] | [number, number, string] } | undefined;

function loadZipData(): { [zip: string]: [number, number] | [number, number, string] } {
    if (typeof _zipData !== 'undefined') return _zipData;
    try {
        const filePath = path.posix.join(process.cwd(), 'data', 'usZipCoords.json');
        if (fs.existsSync(filePath)) {
            _zipData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            logger.info(`Loaded ${Object.keys(_zipData).length} US zip code coordinates`);
        } else {
            _zipData = {};
        }
    } catch (err) {
        logger.error(`Failed to load zip coordinate data: ${err.message}`);
        _zipData = {};
    }
    return _zipData;
}

export function getCoordinatesForZip(zip: string): { latitude: number, longitude: number } | undefined {
    if (!zip || zip.length < 5) return undefined;
    const data = loadZipData();
    const entry = data[zip.substring(0, 5)];
    if (entry) return { latitude: entry[0], longitude: entry[1] };
    return undefined;
}

export function getStateForZip(zip: string): string | undefined {
    if (!zip || zip.length < 5) return undefined;
    const data = loadZipData();
    const entry = data[zip.substring(0, 5)];
    if (entry && entry.length >= 3 && typeof entry[2] === 'string' && entry[2].length > 0) return entry[2];
    return undefined;
}
