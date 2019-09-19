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

export class ConfigMessage
{
    // Firing up the mobi after changing settings.
    // 1. Asked for chlorinator config (0)
    // 2. Asked for features (0-20)... the whole banana except 21-22.  It did not send the Acks (1 for each received packet 0-20) until it had gotten all the packets.
    // 3. Then it asked for features (21-22) which I didn't actually get.
    // 4. Then it asked for a config option [222][15][0].
    //  Response: [165, 63, 15, 16, 30, 29][15, 0, 32, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255][3, 108]
    public static process ( msg: Inbound ): void
    {
        switch ( msg.controllerType )
        {
            case ControllerType.IntelliCenter:
                switch ( msg.extractPayloadByte( 0 ) )
                {
                    case 0:
                        OptionsMessage.process( msg );
                        break;
                    case 1:
                        CircuitMessage.process( msg );
                        break;
                    case 2:
                        FeatureMessage.process( msg );
                        break;
                    case 3:
                        ScheduleMessage.process( msg );
                        break;
                    case 4:
                        PumpMessage.process( msg );
                        break;
                    case 5:
                        RemoteMessage.process( msg );
                        break;
                    case 6:
                        CircuitGroupMessage.process( msg );
                        break;
                    case 7:
                        ChlorinatorMessage.process( msg );
                        break;
                    case 8:
                        IntellichemMessage.process( msg );
                        break;
                    case 9:
                        ValveMessage.process( msg );
                        break;
                    case 10:
                        HeaterMessage.process( msg );
                        break;
                    case 11:
                        SecurityMessage.process( msg );
                        break;
                    case 12:
                        GeneralMessage.process( msg );
                        break;
                    case 13:
                        EquipmentMessage.process( msg );
                        break;
                    case 14:
                        CoverMessage.process( msg );
                        break;
                }
            case ControllerType.IntelliTouch:
                // 
                switch (msg.action){}
                break;
        }

    }
}
