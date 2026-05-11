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
import { sys, SecurityRole } from "../../../Equipment";
import { logger } from "../../../../logger/Logger";

export class SecurityMessage {
    public static process(msg: Inbound): void {
        const item = msg.extractPayloadByte(1, 0);
        const roleId = item + 1;
        const roleName = msg.extractPayloadString(5, 16).trim();
        const pinNumber = ((msg.extractPayloadByte(3, 0) & 0xFF) << 8) | (msg.extractPayloadByte(4, 0) & 0xFF);
        const timeout = msg.extractPayloadByte(25, 0);
        const permissionsBytes = [
            msg.extractPayloadByte(21, 0),
            msg.extractPayloadByte(22, 0),
            msg.extractPayloadByte(23, 0),
            msg.extractPayloadByte(24, 0)
        ];
        const permissionsMask =
            ((permissionsBytes[0] & 0xFF) * 16777216) +
            ((permissionsBytes[1] & 0xFF) * 65536) +
            ((permissionsBytes[2] & 0xFF) * 256) +
            (permissionsBytes[3] & 0xFF);
        const hasRoleData = item === 0 || roleName.length > 0 || permissionsMask > 0;

        logger.debug(`SecurityMessage: item=${item} roleId=${roleId} name="${roleName}" pin=${pinNumber.toString().padStart(4, '0')} timeout=${timeout} bytes=[${permissionsBytes}] mask=0x${permissionsMask.toString(16).padStart(8, '0')} hasData=${hasRoleData}`);

        if (hasRoleData) {
            const role: SecurityRole = sys.security.roles.getItemById(roleId, true);
            role.name = roleName;
            role.timeout = timeout;
            role.flag1 = msg.extractPayloadByte(2, 0);
            role.flag2 = msg.extractPayloadByte(24, 0);
            role.pin = pinNumber.toString().padStart(4, '0');
            role.permissionsMask = permissionsMask;
            role.permissionsBytes = permissionsBytes;
            if (item === 0) {
                sys.security.enabledByte = permissionsBytes[3];
                sys.security.enabled = (permissionsBytes[3] & 0x80) === 0x80;
                sys.security.guestEnabled = (permissionsBytes[3] & 0x40) === 0x40;
            }
        } else {
            sys.security.roles.removeItemById(roleId);
        }
        msg.isProcessed = true;
    }
}
