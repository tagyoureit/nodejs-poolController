import { Inbound, Message, Outbound, Protocol } from "../controller/comms/messages/Messages";
import { ControllerType } from "../controller/Constants";
import { sys } from "../controller/Equipment";
import { logger } from "../logger/Logger";
import { mockChlor } from "./chemistry/MockChlorinator";


export class MessagesMock {
    constructor() { }

    public static processInbound(msg: Inbound): Outbound {
        switch (msg.protocol) {
            case Protocol.Broadcast: {
                let response: Outbound = Outbound.create({
                    portId: msg.portId,
                    protocol: msg.protocol,
                    dest: msg.source,
                    source: msg.dest
                });
                switch (sys.controllerType) {
                    case ControllerType.IntelliCenter:
                        switch (msg.action) {
                            /* case xyz:
                                */
                            default:
                                logger.info(`An unprocessed message was received ${msg.toPacket()}`)
                                break;

                        }
                    default:
                        {

                            switch (msg.action) {
                                /*  SET COMMANDS  */
                                case 133: // set date/time
                                case 134: // set circuit
                                case 136: // set heat/temperature
                                case 138: // set custom names
                                case 139: // set circuit names/functions
                                case 144: // set heat pump status
                                case 145: // set schedule
                                case 146: // set intellichem
                                case 147: // set intellichem
                                case 150: // set intellflo spa side controllers
                                case 152: // set pump config
                                case 153: // set intellichlor
                                case 155: // set pump config extended
                                case 157: // set valve
                                case 158: // set high speed circuits
                                case 160: // set is4/is10 high speed circuits
                                case 161: // set quicktouch remote
                                case 162: // set solar/heat pump config
                                case 131: // set delay
                                case 163: // set delay
                                case 167: // set light group
                                case 168: // set settings
                                    return sys.anslq25Board.system.sendAck(msg, response);

                                /*  GET COMMANDS  */
                                case 194: // get controller status
                                    break;
                                case 197: // get date time
                                    sys.anslq25Board.system.processDateTimeAsync(msg, response);
                                    break;
                                case 198: // get circuit state
                                    break;
                                case 200: // get heat/status
                                    sys.anslq25Board.heaters.processHeatModesAsync(msg, response);
                                    break;
                                case 202: // get custom names
                                    sys.anslq25Board.system.processCustomNameAsync(msg, response);
                                    break;
                                case 203: //get circuit functions
                                    sys.anslq25Board.circuits.processCircuitAsync(msg, response);
                                    break;
                                case 208: // get heat pump status
                                    break;
                                case 209: // get schedule
                                    sys.anslq25Board.schedules.processScheduleAsync(msg, response);
                                    break;

                                case 210: // get intellichem
                                case 211: // get intellichem
                                    logger.error(`mock packet ${msg.action} not programmed yet.`)
                                    break;
                                case 214: // get intelliflo spa side
                                    sys.anslq25Board.remotes.processSpaCommandRemoteAsync(msg, response);
                                    break;
                                case 215: // get pump status
                                case 216: // get pump config
                                case 217: // get intellichlor
                                case 219: // get pump config
                                    logger.error(`mock packet ${msg.action} not programmed yet.`)
                                    break;
                                case 221: // get valve
                                    sys.anslq25Board.valves.processValveAssignmentsAsync(msg, response);
                                    break;
                                case 222: // get high speed circuits
                                    break;
                                case 224: // get is4/is10
                                    sys.anslq25Board.remotes.processIS4IS10RemoteAsync(msg, response);
                                    break;
                                case 225: //get quicktouch
                                    sys.anslq25Board.remotes.processQuickTouchRemoteAsync(msg, response);
                                    break;
                                case 226: // get solar/heat pump
                                    sys.anslq25Board.heaters.processHeaterConfigAsync(msg, response);
                                    break;
                                case 227: // get delays
                                    sys.anslq25Board.valves.processValveOptionsAsync(msg, response);
                                    break;
                                case 231: // get light groups
                                    sys.anslq25Board.circuits.processLightGroupAsync(msg, response);
                                    break;
                                case 239: // get unknown
                                    break;
                                case 232: // get settings
                                    sys.anslq25Board.system.processSettingsAsync(msg, response);
                                    break;
                                case 253: // get sw version
                                    logger.info(`Mock EasyTouch OCP - Packet ${msg.toShortPacket()} request not programmed yet.`)
                                    break;
                                case 1: // Ack
                                case 2:  // Shared IntelliCenter/IntelliTouch
                                case 5:
                                case 8:
                                case 96: // EquipmentStateMessage.process(this);
                                case 10: // CustomNameMessage.process(this);
                                case 11: // CircuitMessage.processTouch(this);
                                case 25: // ChlorinatorMessage.processTouch(this);
                                case 153: // ExternalMessage.processTouchChlorinator(this);
                                case 17:
                                case 145: // ScheduleMessage.process(this);
                                case 18:  // IntellichemMessage.process(this);
                                case 24:
                                case 27:
                                case 152:
                                case 155: // PumpMessage.process(this);
                                case 30:
                                // switch (sys.controllerType) {
                                //     case ControllerType.Unknown:
                                //         break;
                                //     case ControllerType.SunTouch:
                                //         ScheduleMessage.processSunTouch(this);
                                //         break;
                                //     default:
                                //         OptionsMessage.process(this);
                                //         break;
                                // }
                                case 22:
                                case 32:
                                case 33: // RemoteMessage.process(this);
                                case 29:
                                case 35: // ValveMessage.process(this);
                                case 39:
                                case 167: // CircuitMessage.processTouch(this);
                                case 40:
                                case 168: // OptionsMessage.process(this);
                                case 41:  // CircuitGroupMessage.process(this);
                                case 197: // EquipmentStateMessage.process(this);    // Date/Time request
                                case 252: // EquipmentMessage.process(this);
                                case 9:
                                case 16:
                                case 34:
                                case 137:
                                case 144:
                                case 162: // HeaterMessage.process(this);
                                case 114:
                                case 115: // HeaterStateMessage.process(this);
                                case 147: // IntellichemMessage.process(this);
                                    logger.info(`Mock EasyTouch OCP - Packet ${msg.toShortPacket()} should be coming to the OCP, not from it.`);
                                    break;
                                default:
                                    logger.info(`No mock EasyTouch response for ${msg.toShortPacket()} `);
                            }
                        }
                }
                break;
            }
            /*
            case Protocol.IntelliValve:
            IntelliValveStateMessage.process(outboundMsg);
            break;
            case Protocol.IntelliChem:
            IntelliChemStateMessage.process(outboundMsg);
            break; * /
            case Protocol.Pump:
            if ((outboundMsg.source >= 96 && outboundMsg.source <= 111) || (outboundMsg.dest >= 96 && outboundMsg.dest <= 111))
            return mockPump.convertOutbound(outboundMsg);
            else
            MockSystemBoard.convertOutbound(outboundMsg);
            /* case Protocol.Heater:
            HeaterStateMessage.process(outboundMsg);
            break;*/
            case Protocol.Chlorinator:
                return mockChlor.process(msg);
            /*
            case Protocol.Hayward:
                PumpStateMessage.processHayward(msg);
                break; */
            default:
                logger.debug(`Unprocessed Message ${msg.toPacket()}`)
                return new Outbound(Protocol.Broadcast, 0, 0, 0, []);
        }
    }

    public processOutbound(outboundMsg: Outbound) {
        // outbound mock messages will be sent here instead of to the comms port
        let inbound = Message.convertOutboundToInbound(outboundMsg);
        let newOut = MessagesMock.processInbound(inbound);
        if (newOut.payload.length > 0) return newOut.toPacket()
        else return [];

    }
}
export var messagesMock = new MessagesMock();