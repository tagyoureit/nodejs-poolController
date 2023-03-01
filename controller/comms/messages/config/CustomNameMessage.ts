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
import { sys } from "../../../Equipment";
export class CustomNameMessage
{
    public static process ( msg: Inbound ): void
    {
        let customNameId = msg.extractPayloadByte( 0 );
        let customName = sys.customNames.getItemById( customNameId, customNameId <= sys.equipment.maxCustomNames );
        customName.name = msg.extractPayloadString( 1, 11 );
        // customName.isActive = customNameId <= sys.equipment.maxCustomNames && !customName.name.includes('USERNAME-')
        if (customNameId >= sys.equipment.maxCustomNames) sys.equipment.maxCustomNames = customNameId + 1;
        sys.board.system.syncCustomNamesValueMap();
        msg.isProcessed = true;
    }
}