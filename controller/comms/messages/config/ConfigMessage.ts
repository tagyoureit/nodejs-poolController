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
import { CircuitMessage } from "./CircuitMessage";
import { HeaterMessage } from "./HeaterMessage";
import { FeatureMessage } from "./FeatureMessage";
import { ScheduleMessage } from "./ScheduleMessage";
import { PumpMessage } from "./PumpMessage";
import { RemoteMessage } from "./RemoteMessage";
import { CircuitGroupMessage } from "./CircuitGroupMessage";
import { ChlorinatorMessage } from "./ChlorinatorMessage";
import { ValveMessage } from "./ValveMessage";
import { GeneralMessage } from "./GeneralMessage";
import { EquipmentMessage } from "./EquipmentMessage";
import { SecurityMessage } from "./SecurityMessage";
import { OptionsMessage } from "./OptionsMessage";
import { CoverMessage } from "./CoverMessage";
import { IntellichemMessage } from "./IntellichemMessage";
import { ControllerType } from "../../../Constants";
import { sys } from '../../../Equipment';
import { ExternalMessage } from "./ExternalMessage";
import { logger } from "../../../../logger/Logger";

export class ConfigMessage {
    // Firing up the mobi after changing settings.
    // 1. Asked for chlorinator config (0)
    // 2. Asked for features (0-20)... the whole banana except 21-22.  It did not send the Acks (1 for each received packet 0-20) until it had gotten all the packets.
    // 3. Then it asked for features (21-22) which I didn't actually get.
    // 4. Then it asked for a config option [222][15][0].
    //  Response: [165, 63, 15, 16, 30, 29][15, 0, 32, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255][3, 108]
    public static process(msg: Inbound): void {
        switch (sys.controllerType) {
            case ControllerType.IntelliCenter:
                switch (msg.extractPayloadByte(0)) {
                    case 0:
                        OptionsMessage.process(msg);
                        break;
                    case 1:
                        CircuitMessage.processIntelliCenter(msg);
                        break;
                    case 2:
                        FeatureMessage.process(msg);
                        break;
                    case 3:
                        ScheduleMessage.process(msg);
                        break;
                    case 4:
                        PumpMessage.process(msg);
                        break;
                    case 5:
                        RemoteMessage.process(msg);
                        break;
                    case 6:
                        CircuitGroupMessage.process(msg);
                        break;
                    case 7:
                        ChlorinatorMessage.process(msg);
                        break;
                    case 8:
                        IntellichemMessage.process(msg);
                        break;
                    case 9:
                        ValveMessage.process(msg);
                        break;
                    case 10:
                        HeaterMessage.process(msg);
                        break;
                    case 11:
                        SecurityMessage.process(msg);
                        break;
                    case 12:
                        GeneralMessage.process(msg);
                        break;
                    case 13:
                        EquipmentMessage.process(msg);
                        break;
                    case 14:
                        CoverMessage.process(msg);
                        break;
                    case 15:
                        // Send this off to the external message processor
                        // since it knows all that it needs to know to process the config.  This
                        // is a replica of the external 15 message.
                        ExternalMessage.processIntelliCenterState(msg);
                        break;
                    default:
                        logger.debug(`Unprocessed Config Message ${msg.toPacket()}`)
                        break;
                }
                break;
            case ControllerType.EasyTouch:
            case ControllerType.SunTouch:
            case ControllerType.IntelliCom:
            case ControllerType.IntelliTouch:
                // switch (msg.action) { }
                break;
        }

    }
}
