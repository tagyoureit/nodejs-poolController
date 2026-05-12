import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../logger/Logger';

let _zipData: { [zip: string]: [number, number] } | undefined;

function loadZipData(): { [zip: string]: [number, number] } {
    if (typeof _zipData !== 'undefined') return _zipData;
    try {
        const filePath = path.join(path.dirname(require.main?.filename || __dirname), 'data', 'usZipCoords.json');
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
