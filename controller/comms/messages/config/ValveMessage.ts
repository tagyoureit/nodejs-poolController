import { Inbound, ControllerType } from "../Messages";
import { sys, Valve } from "../../../Equipment";
import { Enums } from "../../../Constants";
export class ValveMessage
{
    public static process ( msg: Inbound ): void
    {
        switch ( msg.controllerType )
        {
            case ControllerType.IntelliCenter:
                switch ( msg.extractPayloadByte( 1 ) )
                {
                    case 0: // Circuit Data
                        ValveMessage.processCircuit( msg );
                        break;
                    case 1:
                    case 2:
                        ValveMessage.processValveNames( msg );
                        break;
                    case 3: // Skip the secondary intake/return
                        break;
                    case 4:
                    case 5:
                    case 6:
                    case 7:
                    case 8:
                    case 9:
                    case 10:
                    case 11:
                    case 12:
                    case 13:
                    case 14:
                        ValveMessage.processValveNames( msg );
                        break;
                }
                break;
            case ControllerType.IntelliTouch:
                switch ( msg.action )
                {
                    case 29:
                        ValveMessage.process_ValveAssignment_IT( msg );
                        break;
                    case 35:
                        ValveMessage.process_ValveOptions_IT( msg );
                        break;
                }
        }
    }
    private static process_ValveOptions_IT ( msg: Inbound )
    {
        // sample packet
        // [165,33,15,16,35,2],[132,0],[1,142]
        //                      ^^^ 128 = Pump off during valve operation
        sys.general.options.pumpDelay = ( msg.extractPayloadByte( 0 ) >> 7 ) === 1;
    }
    private static process_ValveAssignment_IT ( msg: Inbound )
    {
        // sample packet
        // 165,33,16,34,157,6,0,0,1,255,255,255,4,153  [set]
        // [165,33,15,16,29,24],[2,0,0,0,128,1,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[4,154] [get]
        let valve = sys.valves.getItemById( 2, true );
        valve.circuit = msg.extractPayloadByte( 5 );
        valve.isActive = valve.circuit > 0;
        valve.name = ValveMessage.getName( valve.circuit );
    }
    private static getName ( cir: number )
    {
        if ( cir < 64 )
        {
            return sys.circuits.getItemById( cir ).name;
        }
        else
        {
            return Enums.CircuitFunctions_IT.transform( cir ).desc;
        }
    }
    private static processCircuit(msg: Inbound) {
        // When it comes to valves there are some interesting numberings
        // going on.  This is due to the fact that the position 5 & 6 are for a secondary pool control.  This will make
        // the id of any valve > 5 skip 2 numbers in between.
        var ndx: number = 2;
        for (let i = 1; ndx < msg.payload.length - 1 && i <= sys.equipment.maxValves; i++) {
            var valve: Valve = sys.valves.getItemById(i, i <= sys.equipment.maxValves);
            valve.circuit = msg.extractPayloadByte(ndx);
            if (ndx === 5) ndx += 2;
            valve.isActive = i <= sys.equipment.maxValves;
            ndx++;
        }
    }
    private static processValveNames(msg: Inbound) {
        var valveId = msg.extractPayloadByte(1) <= 2 ? ((msg.extractPayloadByte(1) - 1) * 2) + 1 : ((msg.extractPayloadByte(1) - 4) * 2) + 5;
        if (valveId <= sys.equipment.maxValves) sys.valves.getItemById(valveId++).name = msg.extractPayloadString(2, 16);
        if (valveId <= sys.equipment.maxValves) sys.valves.getItemById(valveId++).name = msg.extractPayloadString(18, 16);
    }
}