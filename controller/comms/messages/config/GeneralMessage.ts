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
import { logger } from "../../../../logger/Logger";
export class GeneralMessage {
    public static process(msg: Inbound): void {
        switch (msg.extractPayloadByte(1)) {
            case 0:
                sys.general.alias = msg.extractPayloadString(2, 16);
                sys.general.owner.name = msg.extractPayloadString(18, 16);
                sys.general.location.zip = msg.extractPayloadString(34, 6);
                msg.isProcessed = true;
                break;
            case 1:
                sys.general.owner.phone = msg.extractPayloadString(2, 20);
                sys.general.owner.phone2 = msg.extractPayloadString(21, 15);
                sys.general.location.latitude = ((msg.extractPayloadByte(35) * 256) + msg.extractPayloadByte(34)) / 100;
                msg.isProcessed = true;
                break;
            case 2:
                sys.general.location.address = msg.extractPayloadString(2, 32);
                sys.general.location.longitude = -(((msg.extractPayloadByte(35) * 256) + msg.extractPayloadByte(34)) / 100);
                msg.isProcessed = true;
                break;
            case 3:
                sys.general.owner.email = msg.extractPayloadString(2, 32);
                sys.general.location.timeZone = msg.extractPayloadByte(34);
                msg.isProcessed = true;
                break;
            case 4:
                sys.general.owner.email2 = msg.extractPayloadString(2, 32);
                msg.isProcessed = true;
                break;
            case 5:
                sys.general.location.country = msg.extractPayloadString(2, 32);
                msg.isProcessed = true;
                break;
            case 6:
                sys.general.location.city = msg.extractPayloadString(2, 32);
                msg.isProcessed = true;
                break;
            case 7:
                sys.general.location.state = msg.extractPayloadString(2, 32);
                msg.isProcessed = true;
                break;
            default:
                logger.debug(`Unprocessed Config Message ${msg.toPacket()}`)
                break;
        }
    }
}