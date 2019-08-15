import { Inbound } from "../Messages";
import { sys, General, IntelliTouchCircuit } from "../../../Equipment";
import { Enums } from "../../../Constants";
export class OptionsMessage
{
    public static process ( msg: Inbound ): void
    {
        // Start
        //[165, 63, 15, 16, 30, 40][0, 0, 1, 0, 0, 129, 0, 0, 0, 0, 0, 0, 0, 176, 89, 27, 110, 3, 0, 0, 78, 100, 100, 103, 0, 0, 0, 0, 15, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0][5, 80]
        //[165, 63, 15, 16, 30, 40][0, 0, 1, 0, 0, 129, 0, 0, 0, 0, 0, 0, 0, 176, 89, 27, 110, 3, 0, 0, 78, 100, 100, 103, 0, 0, 0, 0, 15, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0][5, 80]

        //[165, 63, 15, 16, 30, 40][0, 0, 1, 0, 0, 129, 0, 0, 0, 0, 0, 0, 0, 176, 89, 27, 110, 3, 0, 0, 78, 100,  99, 103, 0, 3, 0, 0, 15, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 1][5, 83]
        // Pool Solar Only
        //[165, 63, 15, 16, 30, 40][0, 0, 1, 0, 0, 129, 0, 0, 0, 0, 0, 0, 0, 176, 89, 27, 110, 3, 0, 0, 78, 100,  99, 103, 5, 3, 0, 0, 15, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 1][5, 88]
        // Pool Solar Preferred
        //[165, 63, 15, 16, 30, 40][0, 0, 1, 0, 0, 129, 0, 0, 0, 0, 0, 0, 0, 176, 89, 27, 110, 3, 0, 0, 78, 100, 99, 103, 21, 3, 0, 0, 15, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 1][5, 104]
        // Pool Heat mode off
        //[165, 63, 15, 16, 30, 40][0, 0, 1, 0, 0, 129, 0, 0, 0, 0, 0, 0, 0, 176, 89, 27, 110, 3, 0, 0, 78, 100, 99, 103,  0, 3, 0, 0, 15, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 1][5, 83]
        // Spa Heat mode off
        //[165, 63, 15, 16, 30, 40][0, 0, 1, 0, 0, 129, 0, 0, 0, 0, 0, 0, 0, 176, 89, 27, 110, 3, 0, 0, 78, 100, 99, 103,  0, 0, 0, 0, 15, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 1][5, 80]
        //Start
        //[165, 63, 15, 16, 30, 12][0, 1, 0, 0, 255, 255, 255, 255, 255, 255, 2, 30][7, 72]
        // After adding an alert to clhorinator (Cold water alarm)

        switch ( msg.action )
        {
            case 30:
                {
                    // sample packet
                    // [165,33,15,16,30,16],[4,9,16,0,1,72,0,0,16,205,0,0,0,2,0,0],[2,88]
                    // this is (I believe) to assign circuits that require high speed mode with a dual speed pump
                    let hsCollection = sys.equipment.highSpeedCircuits
                    for ( let i = 0; i<=3; i++ )
                    {
                        let hs = hsCollection.getItemById( i, true );
                        let val = msg.extractPayloadByte( i );
                        hs.isActive = val > 0;
                        if ( hs.isActive )
                        {
                            hs.type = val;
                            val < 64 ?
                                hs.name = sys.circuits.getItemById( val ).name
                                : hs.name = Enums.CircuitFunctions_IT.transform( val ).desc
                        }
                    }
                    break;
                }
            case 40: // intellitouch manual heat
                // [165,33,16,34,168,10],[0,0,0,254,0,0,0,0,0,0],[2,168 = manual heat mode off
                // [165,33,16,34,168,10],[0,0,0,254,1,0,0,0,0,0],[2,169] = manual heat mode on
                sys.general.options.manualHeat = msg.extractPayloadByte( 4 ) === 1;
                break;
            case 30: // IntelliCenter
                switch ( msg.extractPayloadByte( 1 ) )
                {
                    case 0:
                        sys.general.options.clockSource = ( msg.extractPayloadByte( 13 ) & 32 ) === 32 ? 'internet' : 'manual';

                        sys.general.options.clockMode = ( msg.extractPayloadByte( 13 ) & 64 ) === 64 ? 24 : 12;
                        sys.general.options.adjustDST = ( msg.extractPayloadByte( 13 ) & 128 ) === 128;
                        sys.general.options.pumpDelay = msg.extractPayloadByte( 29 ) === 1;
                        sys.general.options.cooldownDelay = msg.extractPayloadByte( 37 ) === 1;
                        sys.general.options.manualPriority = msg.extractPayloadByte( 38 ) === 1;
                        sys.general.options.manualHeat = msg.extractPayloadByte( 39 ) === 1;
                        sys.general.options.waterTempAdj2 = ( msg.extractPayloadByte( 2 ) & 0x007F ) * ( ( ( msg.extractPayloadByte( 2 ) & 0x0080 ) > 0 ) ? -1 : 1 );
                        sys.general.options.waterTempAdj1 = ( msg.extractPayloadByte( 3 ) & 0x007F ) * ( ( ( msg.extractPayloadByte( 3 ) & 0x0080 ) > 0 ) ? -1 : 1 );
                        sys.general.options.solarTempAdj1 = ( msg.extractPayloadByte( 4 ) & 0x007F ) * ( ( ( msg.extractPayloadByte( 4 ) & 0x0080 ) > 0 ) ? -1 : 1 );
                        sys.general.options.airTempAdj = ( msg.extractPayloadByte( 5 ) & 0x007F ) * ( ( ( msg.extractPayloadByte( 5 ) & 0x0080 ) > 0 ) ? -1 : 1 );
                        sys.general.options.waterTempAdj2 = ( msg.extractPayloadByte( 6 ) & 0x007F ) * ( ( ( msg.extractPayloadByte( 6 ) & 0x0080 ) > 0 ) ? -1 : 1 );
                        let body = sys.bodies.getItemById( 1, sys.equipment.maxBodies > 0 );
                        body.heatMode = msg.extractPayloadByte( 24 );
                        body.setPoint = msg.extractPayloadByte( 20 );
                        body = sys.bodies.getItemById( 2, sys.equipment.maxBodies > 1 );
                        body.heatMode = msg.extractPayloadByte( 25 );
                        body.setPoint = msg.extractPayloadByte( 22 );
                        body = sys.bodies.getItemById( 3, sys.equipment.maxBodies > 2 );
                        body.heatMode = msg.extractPayloadByte( 26 );
                        body.setPoint = msg.extractPayloadByte( 21 );
                        body.manualHeat = sys.general.options.manualHeat;
                        body = sys.bodies.getItemById( 4, sys.equipment.maxBodies > 3 );
                        body.heatMode = msg.extractPayloadByte( 27 );
                        body.setPoint = msg.extractPayloadByte( 23 );
                        break;
                    case 1: // Unknown
                        break;
                }
        }

    }
}