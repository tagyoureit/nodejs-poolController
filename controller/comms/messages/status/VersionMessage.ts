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
import { sys, ConfigVersion } from "../../../Equipment";
export class VersionMessage {
    public static process(msg: Inbound): void {
        var ver: ConfigVersion = new ConfigVersion({});
        ver.options = msg.extractPayloadInt(6);
        ver.circuits = msg.extractPayloadInt(8);
        ver.features = msg.extractPayloadInt(10);
        ver.schedules = msg.extractPayloadInt(12);
        ver.pumps = msg.extractPayloadInt(14);
        ver.remotes = msg.extractPayloadInt(16);
        ver.circuitGroups = msg.extractPayloadInt(18);
        ver.chlorinators = msg.extractPayloadInt(20);
        ver.intellichem = msg.extractPayloadInt(22);
        ver.valves = msg.extractPayloadInt(24);
        ver.heaters = msg.extractPayloadInt(26);
        ver.security = msg.extractPayloadInt(28);
        ver.general = msg.extractPayloadInt(30);
        ver.equipment = msg.extractPayloadInt(32);
        ver.covers = msg.extractPayloadInt(34);
        ver.systemState = msg.extractPayloadInt(36);
        sys.processVersionChanges(ver);
        msg.isProcessed = true;
    }
}