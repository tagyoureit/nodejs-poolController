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
import { Inbound } from "../Messages";
import { sys, General } from "../../../Equipment";
import { ControllerType } from "../../../Constants";
import { logger } from "../../../../logger/Logger";
export class GeneralMessage {
    private static isIntellicenterV3(): boolean {
        return sys.controllerType === ControllerType.IntelliCenter && sys.equipment.isIntellicenterV3 === true;
    }
    private static getTrimmed(msg: Inbound, start: number, len: number): string {
        return (msg.extractPayloadString(start, len) || '').replace(/\0+$/g, '').trim();
    }
    public static process(msg: Inbound): void {
        const isIntellicenterV3 = GeneralMessage.isIntellicenterV3();
        switch (msg.extractPayloadByte(1)) {
            case 0:
                if (isIntellicenterV3) {
                    // v3.008+ sends location-focused data for item 0.
                    const zip = GeneralMessage.getTrimmed(msg, 2, 6);
                    if (zip.length > 0) sys.general.location.zip = zip;
                    // In captured v3.008 packets, bytes 13/14 map cleanly to longitude magnitude.
                    const lonLo = msg.extractPayloadByte(13, 255);
                    const lonHi = msg.extractPayloadByte(14, 255);
                    if (lonLo !== 255 && lonHi !== 255) {
                        const lon = ((lonHi * 256) + lonLo) / 100;
                        if (!isNaN(lon) && lon > 0 && lon <= 180) sys.general.location.longitude = -lon;
                    }
                    msg.isProcessed = true;
                    break;
                }
                sys.general.alias = msg.extractPayloadString(2, 16);
                sys.general.owner.name = msg.extractPayloadString(18, 16);
                sys.general.location.zip = msg.extractPayloadString(34, 6);
                msg.isProcessed = true;
                break;
            case 1:
                if (isIntellicenterV3) {
                    // v3.008+ item 1 carries city text (not phone fields).
                    const city = GeneralMessage.getTrimmed(msg, 2, 32);
                    if (city.length > 0) sys.general.location.city = city;
                    msg.isProcessed = true;
                    break;
                }
                sys.general.owner.phone = msg.extractPayloadString(2, 20);
                sys.general.owner.phone2 = msg.extractPayloadString(21, 15);
                sys.general.location.latitude = ((msg.extractPayloadByte(35) * 256) + msg.extractPayloadByte(34)) / 100;
                msg.isProcessed = true;
                break;
            case 2:
                if (isIntellicenterV3) {
                    const owner = GeneralMessage.getTrimmed(msg, 2, 16);
                    if (owner.length > 0) sys.general.owner.name = owner;
                    msg.isProcessed = true;
                    break;
                }
                sys.general.location.address = msg.extractPayloadString(2, 32);
                sys.general.location.longitude = -(((msg.extractPayloadByte(35) * 256) + msg.extractPayloadByte(34)) / 100);
                msg.isProcessed = true;
                break;
            case 3:
                if (isIntellicenterV3) {
                    const email = GeneralMessage.getTrimmed(msg, 2, 32);
                    if (email.length > 0) sys.general.owner.email = email;
                    msg.isProcessed = true;
                    break;
                }
                sys.general.owner.email = msg.extractPayloadString(2, 32);
                sys.general.location.timeZone = msg.extractPayloadByte(34);
                msg.isProcessed = true;
                break;
            case 4:
                if (isIntellicenterV3) {
                    const email2 = GeneralMessage.getTrimmed(msg, 2, 32);
                    if (email2.length > 0) sys.general.owner.email2 = email2;
                    msg.isProcessed = true;
                    break;
                }
                sys.general.owner.email2 = msg.extractPayloadString(2, 32);
                msg.isProcessed = true;
                break;
            case 5:
                if (isIntellicenterV3) {
                    const country = GeneralMessage.getTrimmed(msg, 2, 32);
                    if (country.length > 0) sys.general.location.country = country;
                    msg.isProcessed = true;
                    break;
                }
                sys.general.location.country = msg.extractPayloadString(2, 32);
                msg.isProcessed = true;
                break;
            case 6:
                if (isIntellicenterV3) {
                    const city = GeneralMessage.getTrimmed(msg, 2, 32);
                    if (city.length > 0) sys.general.location.city = city;
                    msg.isProcessed = true;
                    break;
                }
                sys.general.location.city = msg.extractPayloadString(2, 32);
                msg.isProcessed = true;
                break;
            case 7:
                if (isIntellicenterV3) {
                    const stateText = GeneralMessage.getTrimmed(msg, 2, 32);
                    if (stateText.length > 0) sys.general.location.state = stateText;
                    msg.isProcessed = true;
                    break;
                }
                sys.general.location.state = msg.extractPayloadString(2, 32);
                msg.isProcessed = true;
                break;
            default:
                logger.debug(`Unprocessed Config Message ${msg.toPacket()}`)
                break;
        }
    }
}