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

export class SecurityMessage {
    public static process(msg: Inbound): void {
        var role: SecurityRole;
        switch (msg.extractPayloadByte(1)) {
            case 0:
                sys.security.enabled = (msg.extractPayloadByte(3) & 1) === 1;
                sys.security.roles.clear();
                break;
        }
        if ((msg.extractPayloadByte(3) & 2) === 2) {
            role = sys.security.roles.getItemById(msg.extractPayloadByte(1) + 1, true);
            role.name = msg.extractPayloadString(4, 16);
            role.timeout = msg.extractPayloadByte(20);
            role.flag1 = msg.extractPayloadByte(2);
            role.flag2 = msg.extractPayloadByte(3);
            role.pin = msg.extractPayloadByte(21).toString() + msg.extractPayloadByte(22).toString() + msg.extractPayloadByte(23).toString() + msg.extractPayloadByte(24).toString();
        }
        msg.isProcessed = true;
    }
}