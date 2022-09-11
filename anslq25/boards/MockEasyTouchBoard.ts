import { logger } from "../../logger/Logger";
import { Outbound, Protocol } from "../../controller/comms/messages/Messages";
import { MockStatusCommands, MockSystemBoard } from "./MockSystemBoard";
import { BodyTempState, state } from "../../controller/State";
import { Heater, PoolSystem, sys } from "../../controller/Equipment";

export class MockEasyTouch extends MockSystemBoard {
  constructor(system: PoolSystem) { super(system); }

  public static convertOutbound(outboundMsg: Outbound) {
    let response: Outbound = Outbound.create({
      portId: outboundMsg.portId,
      protocol: outboundMsg.protocol,
      dest: outboundMsg.source,
      source: outboundMsg.dest
    });

    switch (outboundMsg.action) {
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
        return sys.mockBoard.status.sendAck(outboundMsg, response);
      case 194: // get controller status 
      case 197: // get date time
      case 198: // get circuit state
      case 200: // get heat/status
      case 202: // get custom names
      case 203: //get circuit functions
      case 208: // get heat pump status
      case 209: // get schedule
      case 210: // get intellichem
      case 211: // get intellichem
      case 214: // get intelliflo spa side
      case 215: // get pump status
      case 216: // get pump config
      case 217: // get intellichlor
      case 219: // get pump config
      case 221: // get valve
      case 222: // get high speed circuits
      case 224: // get is4/is10 
      case 225: //get quicktouch
      case 226: // get solar/heat pump
      case 227: // get delays
      case 231: // get light groups
      case 239: // get unknown
      case 232: // get settings
      case 253: // get sw version
        logger.info(`Mock EasyTouch OCP - Packet ${outboundMsg.toShortPacket()} request not programmed yet.`)
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
        logger.info(`Mock EasyTouch OCP - Packet ${outboundMsg.toShortPacket()} should be coming to the OCP, not from it.`);
        break;
      default:
        logger.info(`No mock EasyTouch response for ${outboundMsg.toShortPacket()} `);
    }
  }

  public sendAck(outboundMsg: Outbound, response: Outbound) {
    /*
    *  Per matching rules:
    *  if (msgIn.source === msgOut.dest && msgIn.payload[0] === msgOut.action) return true;
    */
    response.action = 1;
    response.appendPayloadByte(outboundMsg.action);
    return response.toPacket();
  }

  private random(bounds: number, onlyPositive: boolean = false) {
    let rand = Math.random() * bounds;
    if (!onlyPositive) {
      if (Math.random() <= .5) rand = rand * -1;
    }
    return rand;
  }

}

export class EasyTouchMockStatusCommands extends MockStatusCommands {
  public async processStatusAsync(response?: Outbound) {
    if (typeof response === 'undefined'){
      response = Outbound.create({
        portId: sys.anslq25.portId,
        protocol: Protocol.Broadcast,
        dest: 16,
        source: 15
      });
    }
    console.log(`send status command`);
    response.appendPayloadBytes(0, 28);
    // to do: reverse engineer logic for model types
    response.setPayloadByte(27, 0); // model1
    response.setPayloadByte(28, 13); // model2

    // set time
    response.setPayloadByte(0, state.time.hours);
    response.setPayloadByte(1, state.time.minutes);

    // set mode
    response.setPayloadByte(9, response.setPayloadByte[9] | state.mode);

    // set units
    response.setPayloadByte(9, response[9] | state.temps.units);
    
    // set valves
    response.setPayloadByte(10, state.valve);

    // set delay
    response.setPayloadByte(12, response[12] | state.delay);

    // set freeze
    if (state.freeze) response.setPayloadByte(9, response[9] | 0x08);

    // set circuits
    let circuits = state.circuits.get(true);
    let circuitId = 0;
    for (let i = 2; i <= circuits.length; i++) {
      for (let j = 0; j < 8; j++) {

        let circuit = circuits[circuitId];
        if (circuit.isActive && circuit.isOn) {
          response.setPayloadByte(i, response[i] & (1 >> j))
        }
      }
      circuitId++;
    }
    // set temps
    response.setPayloadByte(14, state.temps.waterSensor1);
    response.setPayloadByte(18, state.temps.air);
    let solar: Heater = sys.heaters.getItemById(2);
    if (solar.isActive) response.setPayloadByte(19, state.temps.solar);
    if (sys.bodies.length > 2 || sys.equipment.dual) response.setPayloadByte(15, state.temps.waterSensor2);
    // set body attributes
    if (sys.bodies.length > 0) {
      const tbody: BodyTempState = state.temps.bodies.getItemById(1, true);
      if (tbody.isOn) {
        response.setPayloadByte(2, response[2] | 0x20);
        if (tbody.heatMode > 0) {
          let _heatStatus = sys.board.valueMaps.heatStatus.getName(tbody.heatStatus);
          if (tbody.heaterOptions.hybrid > 0) {

            if (_heatStatus === 'dual') response.setPayloadByte(10, response[10] | 0x14);
            else if (_heatStatus === 'heater') response.setPayloadByte(10, response[10] | 0x10);
            else if (_heatStatus === 'hpheat') response.setPayloadByte(10, response[10] | 0x04);
          }
          else {
            if (_heatStatus === 'heater') response.setPayloadByte(10, response[10] | 0x04);
            if (_heatStatus === 'cooling' || _heatStatus === 'solar') response.setPayloadByte(10, response[10] | 0x10);
          }
        }
      }
    }
    if (sys.bodies.length > 1) {
      const tbody: BodyTempState = state.temps.bodies.getItemById(2, true); 
      // const cbody: Body = sys.bodies.getItemById(2);
      let _heatStatus = sys.board.valueMaps.heatStatus.getName(tbody.heatStatus);
      if (tbody.isOn) response.setPayloadByte(2, response[2] | 0x01);
      response.setPayloadByte(22, response[22] | 0xCC << 2);
      if (tbody.isOn){
        if (tbody.heaterOptions.hybrid > 0){
          let _heatStatus = sys.board.valueMaps.heatStatus.getName(tbody.heatStatus);
          if (tbody.heatMode > 0){
            if (_heatStatus === 'dual') response.setPayloadByte(10, response[10] | 0x28);
            else if (_heatStatus === 'heater') response.setPayloadByte(10, response[10] | 0x20);
            else if (_heatStatus === 'hpheat') response.setPayloadByte(10, response[10] | 0x08);
          }
          else {
            if (_heatStatus === 'heater') response.setPayloadByte(10, response[10] | 0x28);
            if (_heatStatus === 'cooling' || _heatStatus === 'solar') response.setPayloadByte(10, response[10] | 0x20);
          }
        }
      }
    };
  };


}
