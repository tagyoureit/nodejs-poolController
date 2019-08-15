import { Inbound } from "../Messages";
import { ControllerType } from "../../../Constants";
import { state, BodyTempState } from "../../../State";
import { sys, Body, PF } from "../../../Equipment";

export class EquipmentStateMessage
{
    public static process ( msg: Inbound )
    {

        var ndx = 0;
        switch ( msg.action )
        {
            case 2:
                // Shared
                let dt = new Date();
                state.time.hours = msg.extractPayloadByte( 0 );
                state.time.minutes = msg.extractPayloadByte( 1 );
                state.time.seconds = dt.getSeconds();

                state.mode = ( msg.extractPayloadByte( 9 ) & 0x81 );
                state.temps.units = ( msg.extractPayloadByte( 9 ) & 0x04 );
                state.valve = msg.extractPayloadByte( 10 );
                //EquipmentStateMessage.processHeatStatus(msg.extractPayloadByte(11));

                //state.heatMode = msg.extractPayloadByte(11);
                state.delay = msg.extractPayloadByte( 12 );

                if ( msg.controllerType === ControllerType.IntelliCenter )
                {

                    // Legacy message is *ALMOST* the same.
                    //[165,  1, 15, 16, 2, 29][15, 10,  2, 0, 0, 0, 0,  0, 0,  4, 64, 0, 0, 0, 26, 26, 0,   0, 27,   0,  0,   0, 0, 4, 0, 0, 0,  1, 3][1,154]

                    // Everything is off
                    //[165, 63, 15, 16, 2, 29][ 9, 18,  0, 0, 0, 0, 0,  0, 0, 32,  0, 0, 2, 0, 46, 46, 0, 241, 47, 116, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 116]
                    // Turned on Spa Light
                    //[165, 63, 15, 16, 2, 29][ 9, 18, 64, 0, 0, 0, 0,  0, 0, 32,  0, 0, 2, 0, 46, 46, 0, 241, 47, 115, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 179]
                    // Turned on sheer descent.
                    //[165, 63, 15, 16, 2, 29][ 9, 18,  0, 0, 0, 0, 0,  0, 0, 32,  0, 0, 2, 0, 46, 46, 0, 241, 47, 116, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 116]
                    //[165, 63, 15, 16, 2, 29][10, 38,  0, 0, 0, 0, 0, 32, 0, 32,  0, 0, 2, 0, 50, 50, 0, 241, 53, 119, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 186]
                    // Pool is currently running
                    //[165, 63, 15, 16, 2, 29][11, 59, 32, 0, 0, 0, 0,  0, 0, 32,  0, 0, 2, 0, 59, 59, 0, 241, 57, 121, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 232]

                    // Spa turned on.  This says that it is heating with the heater but the heater never turned on.
                    //[165, 63, 15, 16, 2, 29][14, 24, 32, 0, 0, 0, 0,  0, 0, 32, 0,  0, 2, 0, 60, 60, 0, 241, 59,  94, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 177]
                    //[165, 63, 15, 16, 2, 29][14, 24,  1, 0, 0, 0, 0,  0, 0, 32, 8, 16, 2, 0, 60, 60, 0, 241, 59,  94, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 170]
                    // After turning on heater
                    //[165, 63, 15, 16, 2, 29][14, 38,  1, 0, 0, 0, 0,  0, 0, 32, 8, 16, 2, 0, 57, 57, 0, 241, 50,  89, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 164]
                    // After setting solar only
                    //[165, 63, 15, 16, 2, 29][14, 38,  1, 0, 0, 0, 0,  0, 0, 32, 8, 16, 2, 0, 57, 57, 0, 241, 50,  89, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 164]
                    //After setting solar preferred
                    //[165, 63, 15, 16, 2, 29][14, 40,  1, 0, 0, 0, 0,  0, 0, 32, 8, 32, 2, 0, 57, 57, 0, 241, 49,  89, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 181]
                    //After setting heat mode off
                    //[165, 63, 15, 16, 2, 29][14, 42, 32, 0, 0, 0, 0,  0, 0, 32, 0,  0, 2, 0, 57, 57, 0, 241, 49,  89, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 174]

                    //Previous tests invalid.  Spa RPM too low.  This didn't seem to matter as only the temp is changing
                    //[165, 63, 15, 16, 2, 29][11, 19,  1, 0, 0, 0, 0,  0, 0, 32, 8, 16, 2, 0, 60, 60, 0, 241, 57, 100, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 166]


                    // Everything off
                    //[165, 63, 15, 16, 2, 29][14, 18,  0, 0, 0, 0, 0, 0, 0, 32,  0,  0, 2, 0, 62, 62, 0, 241, 61, 96, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 147]
                    // Pool on
                    //[165, 63, 15, 16, 2, 29][14, 19, 32, 0, 0, 0, 0, 0, 0, 32,  0,  0, 2, 0, 62, 62, 0, 241, 62, 98, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 183]
                    //[165, 63, 15, 16, 2, 29][14, 20, 32, 0, 0, 0, 0, 0, 0, 32,  0,  0, 2, 0, 63, 63, 0, 241, 61, 97, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 184]
                    // Everything off
                    //[165, 63, 15, 16, 2, 29][14, 21,  0, 0, 0, 0, 0, 0, 0, 32,  0,  0, 2, 0, 63, 63, 0, 241, 61, 99, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 155]
                    // Spa on
                    //[165, 63, 15, 16, 2, 29][14, 22,  1, 0, 0, 0, 0, 0, 0, 32,  8, 16, 2, 0, 63, 63, 0, 241, 62, 96, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 179]
                    //[165, 63, 15, 16, 2, 29][14, 22,  1, 0, 0, 0, 0, 0, 0, 32,  8, 16, 2, 0, 63, 63, 0, 241, 62, 96, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 179]
                    // Everything off
                    //[165, 63, 15, 16, 2, 29][14, 24,  0, 0, 0, 0, 0, 0, 0, 32,  8, 16, 2, 0, 65, 65, 0, 241, 63, 97, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 186]
                    //[165, 63, 15, 16, 2, 29][14, 24,  0, 0, 0, 0, 0, 0, 0, 32,  0,  0, 2, 0, 65, 65, 0, 241, 63, 96, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 161]

                    // Pool On with heater
                    //[165, 63, 15, 16, 2, 29][14, 29, 32, 0, 0, 0, 0, 0, 0, 32,  4,  1, 2, 0, 65, 65, 0, 241, 63, 95, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 202]
                    // After change to solar only
                    //[165, 63, 15, 16, 2, 29][14, 32, 32, 0, 0, 0, 0, 0, 0, 32,  4,  2, 2, 0, 64, 64, 0, 241, 63, 99, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 208]
                    //[165, 63, 15, 16, 2, 29][14, 33, 32, 0, 0, 0, 0, 0, 0, 32,  4,  2, 2, 0, 64, 64, 0, 241, 63, 98, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 208]
                    // After change to solar preferred
                    //[165, 63, 15, 16, 2, 29][14, 33, 32, 0, 0, 0, 0, 0, 0, 32,  4,  2, 2, 0, 64, 64, 0, 241, 63, 99, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 209]
                    //[165, 63, 15, 16, 2, 29][14, 34, 32, 0, 0, 0, 0, 0, 0, 32,  4,  2, 2, 0, 64, 64, 0, 241, 62, 96, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 206]
                    // After heater off
                    //[165, 63, 15, 16, 2, 29][14, 35, 32, 0, 0, 0, 0, 0, 0, 32,  4,  2, 2, 0, 64, 64, 0, 241, 62, 94, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 205]
                    //[165, 63, 15, 16, 2, 29][14, 36, 32, 0, 0, 0, 0, 0, 0, 32,  0,  0, 2, 0, 64, 64, 0, 241, 62, 93, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 199]
                    //Spa on with solar
                    //[165, 63, 15, 16, 2, 29][15, 38,  1, 0, 0, 0, 0, 0, 0, 32,  8, 32, 2, 0, 64, 64, 0, 241, 62, 98, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 216]
                    //[165, 63, 15, 16, 2, 29][15, 41,  1, 0, 0, 0, 0, 0, 0, 32,  8, 32, 2, 0, 65, 65, 0, 241, 62, 99, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 222]
                    //Spa heater mode off
                    //[165, 63, 15, 16, 2, 29][15, 45,  1, 0, 0, 0, 0, 0, 0, 32,  8, 16, 2, 0, 65, 65, 0, 241, 63, 99, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 211]

                    //Pool On no heat
                    //[165, 63, 15, 16, 2, 29][15, 54, 32, 0, 0, 0, 0, 0, 0, 32,  0,  0, 2, 0, 64, 64, 0, 241, 62, 102, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 227]
                    //Spa On no heat
                    //[165, 63, 15, 16, 2, 29][15, 56,  1, 0, 0, 0, 0, 0, 0, 32,  0,  0, 2, 0, 64, 64, 0, 241, 63, 106, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 203]
                    //Spa On solar heat
                    //[165, 63, 15, 16, 2, 29][15, 58,  1, 0, 0, 0, 0, 0, 0, 32,  8, 32, 2, 0, 66, 66, 0, 241, 63, 104, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 247]
                    //[165, 63, 15, 16, 2, 29][15, 58,  1, 0, 0, 0, 0, 0, 0, 32,  8, 32, 2, 0, 66, 66, 0, 241, 63, 104, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 247]
                    //Spa On heater heat
                    //[165, 63, 15, 16, 2, 29][16,  0,  1, 0, 0, 0, 0, 0, 0, 32,  8, 16, 2, 0, 67, 67, 0, 241, 63, 101, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 173]
                    //[165, 63, 15, 16, 2, 29][16,  1,  1, 0, 0, 0, 0, 0, 0, 32,  8, 16, 2, 0, 67, 67, 0, 241, 63, 102, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 175]
                    //Spa On solar preferred
                    //[165, 63, 15, 16, 2, 29][16,  1,  1, 0, 0, 0, 0, 0, 0, 32,  8, 32, 2, 0, 67, 67, 0, 241, 63, 101, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 190]
                    //Pool On solar heat
                    //[165, 63, 15, 16, 2, 29][16,  3, 32, 0, 0, 0, 0, 0, 0, 32,  4,  2, 2, 0, 68, 68, 0, 241, 63, 102, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 192]
                    //Pool On heater heat
                    //[165, 63, 15, 16, 2, 29][16,  4, 32, 0, 0, 0, 0, 0, 0, 32,  4,  1, 2, 0, 65, 65, 0, 241, 63, 104, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 188]
                    //[165, 63, 15, 16, 2, 29][16,  4, 32, 0, 0, 0, 0, 0, 0, 32,  4,  1, 2, 0, 65, 65, 0, 241, 63, 104, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 188]
                    //Pool On no heat
                    //[165, 63, 15, 16, 2, 29][16,  6, 32, 0, 0, 0, 0, 0, 0, 32,  0,  0, 2, 0, 64, 64, 0, 241, 63, 105, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 184]

                    //Pool off no heat
                    //[165, 63, 15, 16, 2, 29][16, 36,  0, 0, 0, 0, 0, 0, 0, 32,  0,  0, 2, 0, 65, 65, 0, 241, 62, 106, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 184]
                    //Pool off solar only
                    //[165, 63, 15, 16, 2, 29][16, 37,  0, 0, 0, 0, 0, 0, 0, 32,  0,  0, 2, 0, 64, 64, 0, 241, 62, 104, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 181]
                    //[165, 63, 15, 16, 2, 29][16, 38,  0, 0, 0, 0, 0, 0, 0, 32,  0,  0, 2, 0, 64, 64, 0, 241, 63, 103, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 182]

                    //All heat off.
                    //[165, 63, 15, 16, 2, 29][19, 32, 0, 0, 0, 0, 0, 0, 0, 32, 0, 0, 2, 0, 71, 71, 0, 241, 68, 69, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 164]
                    //[165, 63, 15, 16, 2, 29][19, 33, 0, 0, 0, 0, 0, 0, 0, 32, 0, 0, 2, 0, 71, 71, 0, 241, 68, 69, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 165]

                    //All Heat off
                    //[255, 0, 255][165, 63, 15, 16, 2, 29][11, 13, 32, 0, 0, 0, 0, 0, 0, 32, 0, 0, 2, 0, 65, 65, 0, 241, 65, 91, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 176]
                    //Change pool to solar only while running
                    //[255, 0, 255][165, 63, 15, 16, 2, 29][11, 13, 32, 0, 0, 0, 0, 0, 0, 32, 4, 2, 2, 0, 66, 66, 0, 241, 65, 91, 24, 246, 0, 0, 0, 0, 0, 23, 0][4, 184]


                    state.temps.waterSensor1 = msg.extractPayloadByte( 14 ) + sys.general.options.waterTempAdj1;
                    if ( sys.bodies.length > 2 ) state.temps.waterSensor2 = msg.extractPayloadByte( 15 ) + sys.general.options.waterTempAdj2;
                    // We are making an assumption here in that the circuits are always labeled the same.
                    // 1=Spa
                    // 6=Pool
                    // 12=Body3
                    // 22=Body4 -- Really not sure about this one.
                    if ( sys.bodies.length > 0 )
                    {
                        // We will not go in here is this is not a shared body.
                        let tbody: BodyTempState = state.temps.bodies.getItemById( 1, true );
                        let cbody: Body = sys.bodies.getItemById( 1 );
                        tbody.heatMode = cbody.heatMode;
                        tbody.setPoint = cbody.setPoint;
                        tbody.name = cbody.name;
                        tbody.circuit = 6;
                        tbody.heatStatus = ( msg.extractPayloadByte( 11 ) & 0x0F );
                        if ( ( msg.extractPayloadByte( 2 ) & 0x20 ) === 32 )
                        {
                            tbody.temp = state.temps.waterSensor1;
                            tbody.isOn = true;
                        }
                        else
                            tbody.isOn = false;
                    }
                    if ( sys.bodies.length > 1 )
                    {
                        let tbody: BodyTempState = state.temps.bodies.getItemById( 2, true );
                        let cbody: Body = sys.bodies.getItemById( 2 );
                        tbody.heatMode = cbody.heatMode;
                        tbody.setPoint = cbody.setPoint;
                        tbody.name = cbody.name;
                        tbody.circuit = 1;
                        tbody.heatStatus = ( msg.extractPayloadByte( 11 ) & 0xF0 ) >> 4;
                        if ( ( msg.extractPayloadByte( 2 ) & 0x01 ) === 1 )
                        {
                            tbody.temp = state.temps.waterSensor1;
                            tbody.isOn = true;
                        }
                        else
                            tbody.isOn = false;
                    }
                    if ( sys.bodies.length > 2 )
                    {
                        let tbody: BodyTempState = state.temps.bodies.getItemById( 3, true );
                        let cbody: Body = sys.bodies.getItemById( 3 );
                        tbody.name = cbody.name;
                        tbody.heatMode = cbody.heatMode;
                        tbody.setPoint = cbody.setPoint;
                        tbody.heatStatus = ( msg.extractPayloadByte( 11 ) & 0x0F );
                        tbody.circuit = 12;
                        if ( ( msg.extractPayloadByte( 3 ) & 0x08 ) == 8 )
                        {
                            // This is the first circuit on the second body.
                            tbody.temp = state.temps.waterSensor2;
                            tbody.isOn = true;

                        }
                        else
                            tbody.isOn = false;

                    }
                    if ( sys.bodies.length > 3 )
                    {
                        let tbody: BodyTempState = state.temps.bodies.getItemById( 4, true );
                        let cbody: Body = sys.bodies.getItemById( 4 );
                        tbody.name = cbody.name;
                        tbody.heatMode = cbody.heatMode;
                        tbody.setPoint = cbody.setPoint;
                        tbody.heatStatus = ( msg.extractPayloadByte( 11 ) & 0xF0 ) >> 4;
                        tbody.circuit = 22;
                        if ( ( msg.extractPayloadByte( 5 ) & 0x20 ) === 32 )
                        {
                            // This is the first circuit on the third body or the first circuit on the second expansion.
                            tbody.temp = state.temps.waterSensor2;
                            tbody.isOn = true;
                        }
                        else
                            tbody.isOn = false;

                    }
                    state.temps.air = msg.extractPayloadByte( 18 ) + sys.general.options.airTempAdj; // 18
                    state.temps.solar = msg.extractPayloadByte( 19 ) +
                        sys.general.options.solarTempAdj1; // 19
                    // todo: do not think this is correct - at least not for IntelliTouch
                    state.adjDST = ( msg.extractPayloadByte( 23 ) & 0x01 ) === 0x01; // 23

                }
                else if ( msg.controllerType === ControllerType.IntelliTouch )
                {
                    state.temps.waterSensor1 = msg.extractPayloadByte( 14 );
                    if ( sys.bodies.length > 2 ) state.temps.waterSensor2 = msg.extractPayloadByte( 15 );
                    if ( sys.bodies.length > 0 )
                    {

                        let tbody: BodyTempState = state.temps.bodies.getItemById( 1, true );
                        let cbody: Body = sys.bodies.getItemById( 1 );
                        if ( ( msg.extractPayloadByte( 2 ) & 0x20 ) === 32 )
                        {
                            tbody.temp = state.temps.waterSensor1;
                            tbody.isOn = true;
                        }
                        else
                            tbody.isOn = false;
                        if ( ( ( msg.extractPayloadByte( 10 ) & 0x0C ) >> 2 ) === 3 && tbody.isOn )
                        {
                            // heater
                            tbody.heatStatus = 1;
                        }
                        else if ( ( ( msg.extractPayloadByte( 10 ) & 0x30 ) >> 4 ) === 3 && tbody.isOn )
                        {
                            // solar
                            tbody.heatStatus = 2;
                        }
                        else { tbody.heatStatus = 0; }
                        tbody.setPoint = cbody.setPoint;
                        tbody.name = cbody.name;
                        tbody.circuit = 6;
                        switch ( msg.extractPayloadByte( 22 ) & 0x03 )
                        {
                            case 0: // off
                                tbody.heatMode = cbody.heatMode = 0;
                                break;
                            case 1: // heater
                                tbody.heatMode = cbody.heatMode = 3;
                                break;
                            case 2: // solar pref
                                tbody.heatMode = cbody.heatMode = 21;
                                break;
                            case 3: // solar only
                                tbody.heatMode = cbody.heatMode = 5;
                                break;
                        }
                    }
                    if ( sys.bodies.length > 1 )
                    {
                        let tbody: BodyTempState = state.temps.bodies.getItemById( 2, true );
                        let cbody: Body = sys.bodies.getItemById( 2 );
                        if ( ( msg.extractPayloadByte( 2 ) & 0x01 ) === 1 )
                        {
                            tbody.temp = state.temps.waterSensor2;
                            tbody.isOn = true;
                        }
                        else
                            tbody.isOn = false;
                            switch (( msg.extractPayloadByte( 22 ) & 0x0C ) >> 2)
                            {
                                case 0: // off
                                    tbody.heatMode = cbody.heatMode = 0;
                                    break;
                                case 1: // heater
                                    tbody.heatMode = cbody.heatMode = 3;
                                    break;
                                case 2: // solar pref
                                    tbody.heatMode = cbody.heatMode = 21;
                                    break;
                                case 3: // solar only
                                    tbody.heatMode = cbody.heatMode = 5;
                                    break;
                            }
                        tbody.setPoint = cbody.setPoint;
                        tbody.name = cbody.name;
                        tbody.circuit = 1;
                        if ( ( ( msg.extractPayloadByte( 10 ) & 0xC ) >> 2 ) === 3 && tbody.isOn )
                        {
                            // heater
                            tbody.heatStatus = 1;
                        }
                        else if ( ( ( msg.extractPayloadByte( 10 ) & 0x30 ) >> 4 ) === 3 && tbody.isOn )
                        {
                            // solar
                            tbody.heatStatus = 2;
                        }
                        else { tbody.heatStatus = 0; }
                    }
                }
                EquipmentStateMessage.processCircuitState( msg );
                EquipmentStateMessage.processFeatureState( msg );
                state.emitControllerChange();
                state.temps.emitEquipmentChange();
                break;
            case 5: // Intellitouch only.  Date/Time packet
                //[255,0,255][165,1,15,16,5,8][15,10,8,1,8,18,0,1][1,15]
                state.time.date = msg.extractPayloadByte( 3 );
                state.time.month = msg.extractPayloadByte( 4 );
                state.time.year = msg.extractPayloadByte( 5 );
                sys.general.options.adjustDST = state.adjDST = msg.extractPayloadByte( 7 ) === 0x01;
                // defaults
                sys.general.options.clockMode = 12;
                sys.general.options.clockSource = "manual";
                break;
            case 8: // IntelliTouch only.  Heat status
                // [165,x,15,16,8,13],[75,75,64,87,101,11,0, 0 ,62 ,0 ,0 ,0 ,0] ,[2,190]
                state.temps.waterSensor1 = msg.extractPayloadByte( 0 );
                if ( sys.bodies.length > 1 ) state.temps.waterSensor2 = msg.extractPayloadByte( 1 );
                state.temps.air = msg.extractPayloadByte( 2 );
                state.temps.solar = msg.extractPayloadByte( 8 );
                if ( sys.bodies.length > 0 )  // pool
                {
                    // We will not go in here is this is not a shared body.
                    let tbody: BodyTempState = state.temps.bodies.getItemById( 1, true );
                    let cbody: Body = sys.bodies.getItemById( 1 );
                    tbody.heatMode = cbody.heatMode = msg.extractPayloadByte( 5 ) & 3;
                    tbody.setPoint = cbody.setPoint = msg.extractPayloadByte( 3 );
                    tbody.name = cbody.name;
                    tbody.circuit = 6;
                    tbody.heatStatus = ( msg.extractPayloadByte( 11 ) & 0x0F );
                    if ( ( msg.extractPayloadByte( 2 ) & 0x20 ) === 32 )
                    {
                        tbody.temp = state.temps.waterSensor1;
                        tbody.isOn = true;
                    }
                    else
                        tbody.isOn = false;
                }
                if ( sys.bodies.length > 1 ) // spa
                {
                    let tbody: BodyTempState = state.temps.bodies.getItemById( 2, true );
                    let cbody: Body = sys.bodies.getItemById( 2 );
                    tbody.heatMode = cbody.heatMode = ( msg.extractPayloadByte( 5 ) & 12 ) >> 2;
                    tbody.setPoint = cbody.setPoint = msg.extractPayloadByte( 4 );
                    tbody.name = cbody.name;
                    tbody.circuit = 1;
                    tbody.heatStatus = ( msg.extractPayloadByte( 11 ) & 0xF0 ) >> 4;
                    if ( ( msg.extractPayloadByte( 2 ) & 0x01 ) === 1 )
                    {
                        tbody.temp = state.temps.waterSensor1;
                        tbody.isOn = true;
                    }
                    else
                        tbody.isOn = false;
                }
                break;
            case 204: // IntelliCenter only.
                // All Off
                //[165, 63, 15, 16, 204, 39][222, 153, 175, 255,  71, 250, 29, 3, 19, 0, 0, 0, 0, 133, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0,   0,  0,   0, 0, 0, 0, 0,  0, 0, 0, 1, 0, 0, 255, 0][8, 22]
                // Pool Turned on ------------ Known -------XXX-------------------|                                                            |---- Start of circuit array
                //[165, 63, 15, 16, 204, 39][222, 201, 176,  31,  71, 253, 29, 3, 19, 0, 0, 0, 0, 133, 0, 0, 0, 0, 0, 2, 0, 0, 4, 0,   1,   0, 16, 0, 0, 0, 0,  0, 0, 0, 1, 0, 0, 255, 0][7, 127]
                // Spa Turned on
                //[165, 63, 15, 16, 204, 39][233, 143, 176,   0,  72, 153, 29, 3, 19, 0, 0, 0, 0, 133, 0, 0, 0, 0, 0, 2, 0, 0, 4, 0, 252, 255, 47, 0, 0, 0, 0,  0, 0, 0, 1, 0, 0, 255, 0][8, 231]
                // Switched heat mode to heater
                //[165, 63, 15, 16, 204, 39][242,  25, 176,   3,  73,  33, 29, 3, 19, 0, 0, 0, 0, 133, 0, 0, 0, 0, 0, 2, 0, 0, 4, 0, 252, 255, 47, 0, 0, 0, 0,  0, 0, 0, 1, 0, 0, 255, 0][8, 6]
                //[165, 63, 15, 16, 204, 39][251, 142, 178, 191,  73, 189, 29, 3, 19, 0, 0, 0, 0, 133, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 252, 255, 47, 0, 0, 0, 0,  0, 0, 0, 1, 0, 0, 255, 0][9, 218]

                //Everything is off
                //[165, 63, 15, 16, 204, 39][ 11,  58, 129, 181, 247, 155, 19, 4, 19, 0, 0, 0, 0, 133, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0,   0,   0,  0, 0, 0, 0, 0, 12, 0, 0, 1, 0, 0, 255, 0][6, 192]
                //After turning on pool. No heat settings.
                //[165, 63, 15, 16, 204, 39][ 28,  89, 139,  73, 248, 120, 19, 4, 19, 0, 0, 0, 0, 133, 0, 0, 0, 0, 0, 2, 0, 0, 4, 0,   1,   0, 16, 0, 0, 0, 0, 12, 0, 0, 1, 0, 0, 255, 0][6, 129]
                //After turning off pool
                //[165, 63, 15, 16, 204, 39][ 35, 186, 139,  46, 249,  52, 19, 4, 19, 0, 0, 0, 0, 133, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0,   0,   0,  0, 0, 0, 0, 0, 12, 0, 0, 1, 0, 0, 255, 0][6, 117]
                //After turning on the cleaner circuit which turns on the pool this message came across.
                //[165, 63, 15, 16, 204, 39][ 43, 174, 139,  47, 249, 155, 19, 4, 19, 1, 0, 0, 0, 133, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0,   2,   0,  0, 0, 0, 0, 0, 12, 0, 0, 1, 0, 0, 255, 0][6, 221]
                //Added the pool circuit to the mix.
                //[165, 63, 15, 16, 204, 39][ 48, 169, 139,  79, 249, 219, 19, 4, 19, 1, 0, 0, 0, 133, 0, 0, 0, 0, 0, 2, 0, 0, 4, 0,   3,   0, 16, 0, 0, 0, 0, 12, 0, 0, 1, 0, 0, 255, 0][7, 82]
                //After turning cleaner back off
                //[165, 63, 15, 16, 204, 39][ 53, 117, 139,  73, 250,  78, 19, 4, 19, 0, 0, 0, 0, 133, 0, 0, 0, 0, 0, 2, 0, 0, 4, 0,   1,   0, 16, 0, 0, 0, 0, 12, 0, 0, 0, 0, 0, 255, 0][6, 141]
                //Switch from pool to spa
                //[165, 63, 15, 16, 204, 39][ 55,  95, 139,  42, 250, 134, 19, 4, 19, 0, 0, 0, 0, 133, 0, 0, 0, 0, 0, 2, 0, 0, 4, 0, 248, 255, 47, 0, 0, 0, 0, 12, 0, 0, 0, 0, 0, 255, 0][8, 167]
                //After turning spa back off again
                //[165, 63, 15, 16, 204, 39][ 61, 122, 139,  41, 251,  54, 19, 4, 19, 0, 0, 0, 0, 133, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0,   0,   0,  0, 0, 0, 0, 0, 12, 0, 0, 1, 0, 0, 255, 0][6, 79]
                state.batteryVoltage = msg.extractPayloadByte( 2 ) / 50;
                state.comms.keepAlives = msg.extractPayloadInt( 4 );
                state.time.date = msg.extractPayloadByte( 6 );
                state.time.month = msg.extractPayloadByte( 7 );
                state.time.year = msg.extractPayloadByte( 8 );
                if ( msg.extractPayloadByte( 37, 255 ) !== 255 )
                {
                    let chlor = state.chlorinators.getItemById( 1 );
                    chlor.superChlorRemaining = ( msg.extractPayloadByte( 37 ) * 3600 ) + ( msg.extractPayloadByte( 38 ) * 60 );
                    chlor.emitEquipmentChange();
                }
                else
                {
                    let chlor = state.chlorinators.getItemById( 1 );
                    chlor.superChlorRemaining = 0;
                    chlor.superChlor = false;
                    chlor.emitEquipmentChange();
                }
                EquipmentStateMessage.processEquipmentState();
                state.emitControllerChange();

                break;
        }

    }
    private static processEquipmentState ()
    {
        state.equipment.model = sys.equipment.model;
        state.equipment.maxBodies = sys.equipment.maxBodies;
        state.equipment.maxCircuits = sys.equipment.maxCircuits;
        state.equipment.maxValves = sys.equipment.maxValves;
        state.equipment.shared = sys.equipment.shared;
    }
    private static processFeatureState ( msg: Inbound )
    {
        // Somewhere in this packet we need to find support for 32 bits of features.
        // Turning on the first defined feature set by 7 to 16
        // Turning on the second defined feature set byte 7 to 32
        // This means that the first 4 feature circuits are located at byte 7 on the 4 most significant bits.  This leaves 28 bits
        // unaccounted for when it comes to a total of 32 features.

        // We do know that the first 6 bytes are accounted for so byte 8, 10, or 11 are potential candidates.
        for ( let i = 1; i <= sys.features.length; i++ )
        {
            // Use a case statement here since we don't know where to go after 4.
            switch ( i )
            {
                case 1:
                case 2:
                case 3:
                case 4:
                    let byte = msg.extractPayloadByte( 7 );
                    let feature = sys.features.getItemById( i );
                    let fstate = state.features.getItemById( i, feature.isActive );
                    fstate.isOn = ( ( byte >> 4 ) & ( 1 << ( i - 1 ) ) ) > 0;
                    fstate.emitEquipmentChange();
                    fstate.name = feature.name;
                    break;
            }

        }
    }
    private static processCircuitState ( msg: Inbound )
    {
        // The way this works is that there is one byte per 8 circuits for a total of 5 bytes or 40 circuits.  The
        // configuration already determined how many available circuits we have by querying the model of the panel
        // and any installed expansion panel models.  Only the number of available circuits will appear in this
        // array.
        let count = Math.min( Math.floor( sys.circuits.length / 8 ), 5 ) + 2;
        let circuitId = 1;
        let body = 0; // Off
        for ( let i = 2; i < msg.payload.length && i <= count; i++ )
        {
            let byte = msg.extractPayloadByte( i );
            // Shift each bit getting the circuit identified by each value.
            for ( let j = 0; j < 8; j++ )
            {
                let circuit = sys.circuits.getItemById( circuitId );
                if ( circuit.isActive )
                {
                    var cstate = state.circuits.getItemById( circuitId, circuit.isActive );
                    cstate.isOn = ( ( byte & ( 1 << ( j ) ) ) >> j ) > 0;
                    cstate.name = circuit.name;
                    cstate.showInFeatures = circuit.showInFeatures;
                    cstate.type = circuit.type;
                    if ( cstate.isOn && circuitId === 6 ) body = 6;
                    if ( cstate.isOn && circuitId === 1 ) body = 1;
                    switch ( circuit.type )
                    {
                        case 6: // Globrite
                        case 5: // Magicstream
                        case 8: // Intellibrite
                        case 10: // Colorcascade
                            cstate.lightingTheme = circuit.lightingTheme;
                            break;
                        case 9:
                            cstate.level = circuit.level;
                            break;
                    }
                    cstate.emitEquipmentChange();
                }
                circuitId++;
            }
        }
        state.body = body;
    }
}