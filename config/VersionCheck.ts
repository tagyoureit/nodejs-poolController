/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017, 2018, 2019, 2020, 2021, 2022.  
Russell Goldin, tagyoureit.  russ.goldin@gmail.com

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
import { logger } from "../logger/Logger";
// import { https } from "follow-redirects";
import * as https from 'https';
import { state } from "../controller/State";
import { sys } from "../controller/Equipment";
import { Timestamp } from "../controller/Constants";
import { execSync } from 'child_process';

class VersionCheck {
    private userAgent: string;
    private gitApiHost: string;
    private gitLatestReleaseJSONPath: string;
    private redirects: number;
    constructor() {
        this.userAgent = 'tagyoureit-nodejs-poolController-app';
        this.gitApiHost = 'api.github.com';
        this.gitLatestReleaseJSONPath = '/repos/tagyoureit/nodejs-poolController/releases/latest';
    }

    public checkGitRemote() {
        // need to significantly rate limit this because GitHub will start to throw 'too many requests' error
        // and we simply don't need to check that often if the app needs to be updated
        if (typeof state.appVersion.nextCheckTime === 'undefined' || new Date() > new Date(state.appVersion.nextCheckTime)) setTimeout(() => { this.checkAll(); }, 100);
    }
    public checkGitLocal() {
        let env = process.env;
        // check local git version
        try {
            let out: string;
            if (typeof env.SOURCE_BRANCH !== 'undefined') 
            {
                out = env.SOURCE_BRANCH // check for docker variable
            }
            else {
                let res = execSync('git rev-parse --abbrev-ref HEAD', { stdio: 'pipe' });
                out = res.toString().trim();
            }
            logger.info(`The current git branch output is ${out}`);
            switch (out) {
            case 'fatal':
            case 'command':
                state.appVersion.gitLocalBranch = '--';
                break;
            default:
                state.appVersion.gitLocalBranch = out;
        }
        }
        catch (err) {
            state.appVersion.gitLocalBranch = '--';
            logger.warn(`Unable to retrieve local git branch.  ${err}`);
        }
        try {
            let out: string;
            if (typeof env.SOURCE_COMMIT !== 'undefined') 
            {
                out = env.SOURCE_COMMIT; // check for docker variable
            }
            else {
                let res = execSync('git rev-parse HEAD', { stdio: 'pipe' });
                out = res.toString().trim();
            }
            logger.info(`The current git commit output is ${out}`);
            switch (out) {
                case 'fatal':
                case 'command':
                    state.appVersion.gitLocalCommit = '--';
                    break;
                default:
                    state.appVersion.gitLocalCommit = out;
            }
        }
        catch (err) { 
            state.appVersion.gitLocalCommit = '--';
            logger.warn(`Unable to retrieve local git commit.  ${err}`); 
        }
    }
    private checkAll() {
        try {
            this.redirects = 0;
            let dt = new Date();
            dt.setDate(dt.getDate() + 2); // check every 2 days
            state.appVersion.nextCheckTime = Timestamp.toISOLocal(dt);
            this.getLatestRelease().then((publishedVersion) => {
                state.appVersion.githubRelease = publishedVersion;
                this.compare();
            });
        }
        catch (err) {
            logger.error(`Error checking latest release: ${err.message}`);
        }
    }

    private async getLatestRelease(redirect?: string): Promise<string> {
        var options = {
            method: 'GET',
            headers: {
                'User-Agent': this.userAgent
            }
        }
        let url: string;
        if (typeof redirect === 'undefined') {
            url = `https://${this.gitApiHost}${this.gitLatestReleaseJSONPath}`;
        }
        else {
            url = redirect;
            this.redirects += 1;
        }
        if (this.redirects >= 20) return Promise.reject(`Too many redirects.`)
        return new Promise<string>((resolve, reject) => {
            try {
                let req = https.request(url, options, async res => {
                    if (res.statusCode > 300 && res.statusCode < 400 && res.headers.location) await this.getLatestRelease(res.headers.location);
                    let data = '';
                    res.on('data', d => { data += d; });
                    res.on('end', () => {
                        let jdata = JSON.parse(data);
                        if (typeof jdata.tag_name !== 'undefined')
                            resolve(jdata.tag_name.replace('v', ''));
                        else
                            reject(`No data returned.`)
                    })
                })
                    .end();
                req.on('error', (err) => {
                    logger.error(`Error getting Github API latest release.  ${err.message}`)
                })
            }
            catch (err) {
                logger.error('Error contacting Github for latest published release: ' + err);
                reject(err);
            };
        })
    }
    public compare() {
        logger.info(`Checking njsPC versions...`);
        if (typeof state.appVersion.githubRelease === 'undefined' || typeof state.appVersion.installed === 'undefined') {
            state.appVersion.status = sys.board.valueMaps.appVersionStatus.getValue('unknown');
            return;
        }
        let publishedVersionArr = state.appVersion.githubRelease.split('.');
        let installedVersionArr = state.appVersion.installed.split('.');
        if (installedVersionArr.length !== publishedVersionArr.length) {
            // this is in case local a.b.c doesn't have same # of elements as another version a.b.c.d.  We should never get here.
            logger.warn(`Cannot check for updated app.  Version length of installed app (${installedVersionArr}) and remote (${publishedVersionArr}) do not match.`);
            state.appVersion.status = sys.board.valueMaps.appVersionStatus.getValue('unknown');
            return;
        } else {
            for (var i = 0; i < installedVersionArr.length; i++) {
                if (publishedVersionArr[i] > installedVersionArr[i]) {
                    state.appVersion.status = sys.board.valueMaps.appVersionStatus.getValue('behind');
                    return;
                } else if (publishedVersionArr[i] < installedVersionArr[i]) {
                    state.appVersion.status = sys.board.valueMaps.appVersionStatus.getValue('ahead');
                    return;
                }
            }
        }
        state.appVersion.status = sys.board.valueMaps.appVersionStatus.getValue('current');
    }
}
export var versionCheck = new VersionCheck();