import { logger } from "../../logger/Logger";
import { Inbound, Outbound, Protocol } from "../../controller/comms/messages/Messages";
import { MockSystemCommands, MockSystemBoard, MockCircuitCommands, MockScheduleCommands, MockHeaterCommands, MockValveCommands, MockRemoteCommands, MockPumpCommands } from "./MockSystemBoard";
import { BodyTempState, state } from "../../controller/State";
import { ControllerType, Heater, PoolSystem, PumpCircuit, sys } from "../../controller/Equipment";
import { byteValueMap } from "../../controller/boards/SystemBoard";
import { conn } from "../../controller/comms/Comms";
import { Timestamp, utils } from "../../controller/Constants";
export class MockEasyTouch extends MockSystemBoard {
  constructor(system: PoolSystem) {
    super(system);
    this.valueMaps.expansionBoards = new byteValueMap([
      [0, { name: 'ET28', part: 'ET2-8', desc: 'EasyTouch2 8', circuits: 8, shared: true }],
      [1, { name: 'ET28P', part: 'ET2-8P', desc: 'EasyTouch2 8P', circuits: 8, single: true, shared: false }],
      [2, { name: 'ET24', part: 'ET2-4', desc: 'EasyTouch2 4', circuits: 4, shared: true }],
      [3, { name: 'ET24P', part: 'ET2-4P', desc: 'EasyTouch2 4P', circuits: 4, single: true, shared: false }],
      [6, { name: 'ETPSL4', part: 'ET-PSL4', desc: 'EasyTouch PSL4', circuits: 4, features: 2, schedules: 4, pumps: 1, shared: true }],
      [7, { name: 'ETPL4', part: 'ET-PL4', desc: 'EasyTouch PL4', circuits: 4, features: 2, schedules: 4, pumps: 1, single: true, shared: false }],
      // EasyTouch 1 models all start at 128.
      [128, { name: 'ET8', part: 'ET-8', desc: 'EasyTouch 8', circuits: 8, shared: true }],
      [129, { name: 'ET8P', part: 'ET-8P', desc: 'EasyTouch 8', circuits: 8, single: true, shared: false }],
      [130, { name: 'ET4', part: 'ET-4', desc: 'EasyTouch 4', circuits: 4, shared: true }],
      [129, { name: 'ET4P', part: 'ET-4P', desc: 'EasyTouch 4P', circuits: 4, single: true, shared: false }]
    ]);
  }
  public system: EasyTouchMockSystemCommands = new EasyTouchMockSystemCommands(this);
  public circuits: EasyTouchMockCircuitCommands = new EasyTouchMockCircuitCommands(this);
  public schedules: EasyTouchMockScheduleCommands = new EasyTouchMockScheduleCommands(this);
  public heaters: EasyTouchMockHeaterCommands = new EasyTouchMockHeaterCommands(this);
  public valves: EasyTouchMockValveCommands = new EasyTouchMockValveCommands(this);
  public remotes: EasyTouchMockRemoteCommands = new EasyTouchMockRemoteCommands(this);
  public pumps: EasyTouchMockPumpCommands = new EasyTouchMockPumpCommands(this);

}

class EasyTouchMockSystemCommands extends MockSystemCommands {
  public async processDateTimeAsync(msg: Inbound) {
    try {
      let response: Outbound = Outbound.create({
        action: 5,
        portId: msg.portId,
        protocol: msg.protocol,
        dest: msg.source,
        source: 16 //msg.dest
      });
      response.appendPayloadBytes(0, 7);
      response.setPayloadByte(0, state.time.hours);
      response.setPayloadByte(1, state.time.minutes);
      response.setPayloadByte(2, Timestamp.dayOfWeek(state.time));
      response.setPayloadByte(3, state.time.date);
      response.setPayloadByte(4, state.time.month);
      response.setPayloadByte(5, state.time.year - 2000);
      response.setPayloadByte(6, sys.general.options.adjustDST ? 1 : 0);
      msg.isProcessed = true;
      await sys.anslq25Board.sendAsync(response);
      //conn.queueSendMessage(response);
    }
    catch (err) {
      logger.error(`ANSLQ25 error processing date/time.  ${err.message}`);
    }
  }
  public async processCustomNameAsync(msg: Inbound): Promise<void> {
    try {
      let response: Outbound = Outbound.create({
        action: 10,
        portId: msg.portId,
        protocol: msg.protocol,
        dest: msg.source,
        source: 16 //msg.dest
      });
      response.appendPayloadByte(msg.payload[0]);
      let cname = sys.customNames.getItemById(msg.payload[0]).name;
      if (typeof cname === 'undefined') response.appendPayloadString(`CustomName${msg.payload[0]}`, 11);
      else
        response.appendPayloadString(cname, 11);
      msg.isProcessed = true;
      await sys.anslq25Board.sendAsync(response);
    }
    catch (err) {
      logger.error(`ANSLQ25 error processing custom name ${msg.payload[0]}.  ${err.message}`);
    }
  }
  public async processSettingsAsync(msg: Inbound): Promise<void> {
    try {
      // 40/168/232
      let response: Outbound = Outbound.create({
        action: 40,
        portId: msg.portId,
        protocol: msg.protocol,
        dest: msg.source,
        source: 16 //msg.dest
      });
      response.appendPayloadBytes(0, 10);
      let chem = sys.chemControllers.getItemByAddress(144);
      if (chem.isActive) response.setPayloadByte(3, 0x01, 0);
      response.setPayloadByte(4, sys.general.options.manualHeat ? 1 : 0, 0);
      response.setPayloadByte(5, sys.general.options.manualPriority ? 1 : 0, 0);
      msg.isProcessed = true;
      await sys.anslq25Board.sendAsync(response);
    }
    catch (err) {
      logger.error(`ANSLQ25 error processing settings.  ${err.message}`);
    }
  }
  public async sendAck(msg: Inbound) {
    /*
    *  Per matching rules:
    *  if (msgIn.source === msgOut.dest && msgIn.payload[0] === msgOut.action) return true;
    */
    let response: Outbound = Outbound.create({
      action: 1,
      portId: msg.portId,
      protocol: msg.protocol,
      dest: msg.source,
      source: 16 //msg.dest
    });

    response.appendPayloadByte(msg.action);
    msg.isProcessed = true;
    await sys.anslq25Board.sendAsync(response);
    // conn.queueSendMessage(response);
  }
  public async sendStatusAsync() {
    try {
      let msg = Outbound.create({
        portId: sys.anslq25.portId,
        protocol: Protocol.Broadcast,
        dest: 16,
        source: 15,
        action: 2
      });

      console.log(`send status command`);
      msg.appendPayloadBytes(0, 29);
      // to do: reverse engineer logic for model types
      // sys.equipment.model;
      // let mod = sys.board.valueMaps.expansionBoards.get(sys.equipment.modules.getItemById(0).type);
      let mt = sys.equipment.modules.getItemById(0);
      let model1 = mt.type
      msg.setPayloadByte(27, model1); // model1
      msg.setPayloadByte(28, 13); // model2

      // set time
      msg.setPayloadByte(0, state.time.hours);
      msg.setPayloadByte(1, state.time.minutes);

      // set mode
      msg.setPayloadByte(9, msg.setPayloadByte[9] | state.mode);

      // set units
      msg.setPayloadByte(9, msg[9] | state.temps.units);

      // set valves
      msg.setPayloadByte(10, state.valve);

      // set delay
      msg.setPayloadByte(12, msg[12] | (Math.max(state.delay, 0)));

      // set freeze
      if (state.freeze) msg.setPayloadByte(9, msg[9] | 0x08);

      // set circuits
      let circuits = state.circuits.get(true);
      let circuitId = 0;
      for (let i = 2; i <= circuits.length; i++) {
        for (let j = 0; j < 8; j++) {

          let circuit = circuits[circuitId];
          if (circuit.isActive && circuit.isOn) {
            msg.setPayloadByte(i, msg[i] & (1 >> j))
          }
        }
        circuitId++;
      }
      // set temps
      msg.setPayloadByte(14, state.temps.waterSensor1);
      msg.setPayloadByte(18, state.temps.air);
      let solar: Heater = sys.heaters.getItemById(2);
      if (solar.isActive) msg.setPayloadByte(19, state.temps.solar);
      if (sys.bodies.length > 2 || sys.equipment.dual) msg.setPayloadByte(15, state.temps.waterSensor2);
      // set body attributes
      if (sys.bodies.length > 0) {
        const tbody: BodyTempState = state.temps.bodies.getItemById(1, true);
        if (tbody.isOn) {
          msg.setPayloadByte(2, msg[2] | 0x20);
          if (tbody.heatMode > 0) {
            let _heatStatus = sys.board.valueMaps.heatStatus.getName(tbody.heatStatus);
            if (tbody.heaterOptions.hybrid > 0) {

              if (_heatStatus === 'dual') msg.setPayloadByte(10, msg[10] | 0x14);
              else if (_heatStatus === 'heater') msg.setPayloadByte(10, msg[10] | 0x10);
              else if (_heatStatus === 'hpheat') msg.setPayloadByte(10, msg[10] | 0x04);
            }
            else {
              if (_heatStatus === 'heater') msg.setPayloadByte(10, msg[10] | 0x04);
              if (_heatStatus === 'cooling' || _heatStatus === 'solar') msg.setPayloadByte(10, msg[10] | 0x10);
            }
          }
        }
        else msg.setPayloadByte(10, 0);
      }
      if (sys.bodies.length > 1) {
        const tbody: BodyTempState = state.temps.bodies.getItemById(2, true);
        // const cbody: Body = sys.bodies.getItemById(2);
        let _heatStatus = sys.board.valueMaps.heatStatus.getName(tbody.heatStatus);
        if (tbody.isOn) msg.setPayloadByte(2, msg[2] | 0x01);
        msg.setPayloadByte(22, msg[22] | tbody.heatMode << 2);
        if (tbody.isOn) {
          if (tbody.heaterOptions.hybrid > 0) {
            let _heatStatus = sys.board.valueMaps.heatStatus.getName(tbody.heatStatus);
            if (tbody.heatMode > 0) {
              if (_heatStatus === 'dual') msg.setPayloadByte(10, msg[10] | 0x28);
              else if (_heatStatus === 'heater') msg.setPayloadByte(10, msg[10] | 0x20);
              else if (_heatStatus === 'hpheat') msg.setPayloadByte(10, msg[10] | 0x08);
            }
            else {
              if (_heatStatus === 'heater') msg.setPayloadByte(10, msg[10] | 0x28);
              if (_heatStatus === 'cooling' || _heatStatus === 'solar') msg.setPayloadByte(10, msg[10] | 0x20);
            }
          }
        }
        else msg.setPayloadByte(10, msg[10], 0);
      };

      // set temps -- 14 (water) and 15 (water2)
      msg.setPayloadByte(14, state.temps.waterSensor1, 0);
      if (sys.bodies.length > 2 || sys.equipment.dual) msg.setPayloadByte(15, state.temps.waterSensor2, 0);
      msg.setPayloadByte(18, state.temps.air, 0);
      msg.setPayloadByte(19, state.temps.solarSensor1, 0);
      if (sys.bodies.length > 2 || sys.equipment.dual)
        msg.setPayloadByte(17, state.temps.solarSensor2, 0);
      if ((sys.bodies.length > 2))
        msg.setPayloadByte(22, state.temps.solarSensor3, 0);
      if ((sys.bodies.length > 3))
        msg.setPayloadByte(23, state.temps.solarSensor4, 0);

      await sys.anslq25Board.sendAsync(msg);
    }
    catch (err) {
      logger.error(`Error sending ANSLQ25 status packet: ${err.message}`);
    }
  };
}

class EasyTouchMockCircuitCommands extends MockCircuitCommands {
  public async processCircuitAsync(msg: Inbound) {
    // example [255,0,255][165,33,16,34,139,5][17,14,209,0,0][2,120]
    // set circuit 17 to function 14 and name 209
    // response: [255,0,255][165,33,34,16,1,1][139][1,133]
    // request for circuit 2: [165,33,16,33,203,1],[2],[1,197]]

    try {
      let response: Outbound = Outbound.create({
        action: 11,
        portId: msg.portId,
        protocol: msg.protocol,
        dest: msg.source,
        source: 16 //msg.dest
      });
      let circuit = sys.circuits.getInterfaceById(msg.payload[0]);
      response.appendPayloadBytes(0, 5);
      response.setPayloadByte(0, circuit.id);
      if (circuit.id === 1) {
        response.setPayloadByte(1, 1 | (circuit.freeze ? 64 : 0), 0);
        response.setPayloadByte(2, 72, 53);

      }
      else if (circuit.id === 6) {
        response.setPayloadByte(1, 2 | (circuit.freeze ? 64 : 0), 0);
        response.setPayloadByte(2, 61, 53);

      }
      else {
        response.setPayloadByte(1, circuit.type | (circuit.freeze ? 64 : 0), 0);
        response.setPayloadByte(2, circuit.nameId, 53);
      }
      msg.isProcessed = true;
      await sys.anslq25Board.sendAsync(response);
    }
    catch (err) {
      logger.error(`ANSLQ25 error processing circuit ${msg.payload[0]}.  ${err.message}`);
    }
  };
  public async processLightGroupAsync(msg: Inbound) {
    try {
      // 39/167/231
      // todo - when 25 packet length vs 32.  May need to add.
      let response: Outbound = Outbound.create({
        action: 39,
        portId: msg.portId,
        protocol: msg.protocol,
        dest: msg.source,
        source: 16 //msg.dest
      });
      let lg = sys.lightGroups.getItemById(sys.board.equipmentIds.circuitGroups.start);
      response.appendPayloadBytes(0, 32);
      for (let byte = 0; byte <= 32; byte = byte + 4) {
        let circuit = sys.circuits.getInterfaceById(byte);
        response.setPayloadByte(byte, circuit.id, 0);
        let pair = byte + 1;
        const lgCircuit = lg.circuits.getItemByCircuitId(circuit.id);
        response.setPayloadByte(pair, Math.max((lgCircuit.position - 1), 0), 0);
        response.setPayloadByte(pair, response.payload[pair] | lgCircuit.color, 0);
        response.setPayloadByte(byte + 2, lgCircuit.swimDelay << 1, 0);
      }
      msg.isProcessed = true;
      await sys.anslq25Board.sendAsync(response);
    }
    catch (err) {
      logger.error(`ANSLQ25 error processing circuit ${msg.payload[0]}.  ${err.message}`);
    }
  };
}

export class EasyTouchMockScheduleCommands extends MockScheduleCommands {
  public async processScheduleAsync(msg: Inbound) {
    // Sample packet
    // Request: 165,33,16,33,209,1,7,1,202
    // Response: [165,33,15,16,17,7][6,12,25,0,6,30,0][1,76]
    try {
      let response: Outbound = Outbound.create({
        action: 17,
        portId: msg.portId,
        protocol: msg.protocol,
        dest: msg.source,
        source: 16 //msg.dest
      });
      response.appendPayloadBytes(0, 7);
      let eggTimer = sys.eggTimers.getItemById(msg.payload[0]);
      let schedule = sys.schedules.getItemById(msg.payload[0]);
      if (eggTimer.isActive) {
        response.setPayloadByte(0, eggTimer.id);
        response.setPayloadByte(1, eggTimer.circuit);
        response.setPayloadByte(2, 25);
        response.setPayloadByte(4, eggTimer.runTime === 27 ? 27 : Math.floor(eggTimer.runTime / 60));
        response.setPayloadByte(5, eggTimer.runTime === 27 ? 0 : eggTimer.runTime - (Math.floor(eggTimer.runTime / 60) * 60));
      }
      else {
        response.setPayloadByte(0, schedule.id);
        response.setPayloadByte(1, schedule.circuit, 0);
        response.setPayloadByte(2, Math.floor(schedule.startTime / 60), 0);
        response.setPayloadByte(3, Math.floor(schedule.startTime / 60) - (Math.floor(schedule.startTime / 60) * 60), 0);
        response.setPayloadByte(4, schedule.scheduleType === 0 ? 0 : Math.floor(schedule.endTime / 60), 0);
        response.setPayloadByte(5, Math.floor(schedule.endTime / 60) - (Math.floor(schedule.endTime / 60) * 60), 0);
        response.setPayloadByte(6, schedule.scheduleDays, 0);
      }
      msg.isProcessed = true;
      await sys.anslq25Board.sendAsync(response);
    }
    catch (err) {
      logger.error(`ANSLQ25 error processing custom name ${msg.payload[0]}.  ${err.message}`);
    }
  };
}

export class EasyTouchMockHeaterCommands extends MockHeaterCommands {
  public async processHeatModesAsync(msg: Inbound) {
    // IntelliTouch only.  Heat status
    // [165,x,15,16,8,13],[75,75,64,87,101,11,0, 0 ,62 ,0 ,0 ,0 ,0] ,[2,190]
    // Heat Modes
    // 1 = Heater
    // 2 = Solar Preferred
    // 3 = Solar Only
    //[81, 81, 82, 85, 97, 7, 0, 0, 0, 100, 100, 4, 0][3, 87]
    // byte | val |
    // 0    | 81  | Water sensor 1
    // 1    | 81  | Unknown (Probably water sensor 2 on a D)
    // 2    | 82  | Air sensor
    // 3    | 85  | Body 1 setpoint
    // 4    | 97  | Body 2 setpoint
    // 5    | 7   | Body 1 & 2 heat mode. (0111) (Pool = 11 Solar only/Spa = 01 Heater)
    // 6    | 0   | Unknown (Water Sensor 3)
    // 7    | 0   | Unknown (Water Sensor 4)
    // 8    | 0   | Unknown -- Reserved air sensor
    // 9    | 100 | Unknown (Body 3 setpoint)
    // 10   | 100 | Unknown (Body 4 setpoint)
    // 11   | 4   | Unknown (Body 3 & 4 head mode. (0010) (Pool = 00 = Off/ 10 = Solar Preferred)
    // 12   | 0   | Unknown
    // There are two messages sent when the OCP tries to tse a heat mode in IntelliTouch.  The first one on the action 136 is for the first 2 bodies and the second
    // is for the remaining 2 bodies.  The second half of this message mirrors the values for the second 136 message.

    try {
      let response: Outbound = Outbound.create({
        action: 8,
        portId: msg.portId,
        protocol: msg.protocol,
        dest: msg.source,
        source: 16 //msg.dest
      });
      response.appendPayloadBytes(0, 13);

      const tbody1: BodyTempState = state.temps.bodies.getItemById(1);
      const tbody2: BodyTempState = state.temps.bodies.getItemById(2);
      response.setPayloadByte(0, state.temps.waterSensor1, 0);
      response.setPayloadByte(1, state.temps.waterSensor2, 0);
      response.setPayloadByte(2, state.temps.air, 0);
      response.setPayloadByte(3, tbody1.setPoint, 0);
      response.setPayloadByte(4, tbody2.setPoint, 0);
      const tbody: BodyTempState = state.temps.bodies.getItemById(1, true);
      if (tbody.heaterOptions.hybrid > 0) {
        response.setPayloadByte(5, tbody2.heatMode << 2 | tbody1.heatMode, 0);
      }
      else {
        response.setPayloadByte(5, tbody1.heatMode << 2 | tbody2.heatMode, 0);
      }
      response.setPayloadByte(9, tbody1.coolSetpoint, 0);
      response.setPayloadByte(9, tbody2.coolSetpoint, 0);
      msg.isProcessed = true;
      await sys.anslq25Board.sendAsync(response);
    }
    catch (err) {
      logger.error(`ANSLQ25 error processing heat modes.  ${err.message}`);
    }
  };


  public async processHeaterConfigAsync(msg: Inbound) {
    // 34/162/226

    try {
      let response: Outbound = Outbound.create({
        action: 34,
        portId: msg.portId,
        protocol: msg.protocol,
        dest: msg.source,
        source: 16 //msg.dest
      });
      response.appendPayloadBytes(0, 3);
      const tbody: BodyTempState = state.temps.bodies.getItemById(1, true);
      if (tbody.heaterOptions.hybrid > 0) {
        response.setPayloadByte(1, 0x10);
      }
      else if (tbody.heaterOptions.heatpump > 0) {
        response.setPayloadByte(1, 0x20);
        let hpump = sys.heaters.getItemById(3);
        if (hpump.heatingEnabled) response.setPayloadByte(1, response.payload[1] | 0x01);
        if (hpump.coolingEnabled) response.setPayloadByte(1, response.payload[1] | 0x02);
      }
      else if (tbody.heaterOptions.solar > 0) {
        response.setPayloadByte(0, 0x01);
        let solar = sys.heaters.getItemById(2);
        if (solar.freeze) response.setPayloadByte(1, response.payload[1] | 0x80);
        if (solar.coolingEnabled) response.setPayloadByte(1, response.payload[1] | 0x20);
        response.setPayloadByte(2, (solar.startTempDelta - 3) << 1);
        response.setPayloadByte(2, response.payload[2] | (solar.stopTempDelta - 2) << 6);

      }
      msg.isProcessed = true;
      await sys.anslq25Board.sendAsync(response);
    }
    catch (err) {
      logger.error(`ANSLQ25 error processing heater config.  ${err.message}`);
    }
  };
}

export class EasyTouchMockValveCommands extends MockValveCommands {
  public async processValveAssignmentsAsync(msg: Inbound) {
    try {
      // 29/157/221
      let response: Outbound = Outbound.create({
        action: 29,
        portId: msg.portId,
        protocol: msg.protocol,
        dest: msg.source,
        source: 16 //msg.dest
      });
      response.appendPayloadBytes(0, 24);
      response.setPayloadByte(1, 2);  //constant
      for (let ndx = 4, id = 1; id <= sys.equipment.maxValves; ndx++) {
        let valve = sys.valves.getItemById(id);
        response.setPayloadByte(ndx, valve.circuit, 0);
        id++;
      }
      msg.isProcessed = true;
      await sys.anslq25Board.sendAsync(response);
    }
    catch (err) {
      logger.error(`ANSLQ25 error processing valve assignment packet.  ${err.message}`);
    }
  };
  public async processValveOptionsAsync(msg: Inbound) {
    try {
      // 35/163/227
      let response: Outbound = Outbound.create({
        action: 35,
        portId: msg.portId,
        protocol: msg.protocol,
        dest: msg.source,
        source: 16 //msg.dest
      });
      response.appendPayloadBytes(0, 2);
      response.setPayloadByte(0, (sys.general.options.pumpDelay ? 128 : 0) | 4, 4);
      msg.isProcessed = true;
      await sys.anslq25Board.sendAsync(response);
    }
    catch (err) {
      logger.error(`ANSLQ25 error processing valve options packet.  ${err.message}`);
    }
  };
}

export class EasyTouchMockRemoteCommands extends MockRemoteCommands {
  public async processIS4IS10RemoteAsync(msg: Inbound) {
    try {
      // 32/160/224
      let response: Outbound = Outbound.create({
        action: 32,
        portId: msg.portId,
        protocol: msg.protocol,
        dest: msg.source,
        source: 16 //msg.dest
      });

      response.appendPayloadBytes(0, 11);
      console.log(sys.remotes.length);
      for (let i = 0; i < sys.remotes.length; i++) {

        let remote = sys.remotes.getItemById(i + 1);
        response.setPayloadByte(0, i);
        response.setPayloadByte(1, remote.button1, 0);
        response.setPayloadByte(2, remote.button2, 0);
        response.setPayloadByte(3, remote.button3, 0);
        response.setPayloadByte(4, remote.button4, 0);
        response.setPayloadByte(5, remote.button5, 0);
        response.setPayloadByte(6, remote.button6, 0);
        response.setPayloadByte(7, remote.button7, 0);
        response.setPayloadByte(8, remote.button8, 0);
        response.setPayloadByte(9, remote.button9, 0);
        response.setPayloadByte(10, remote.button10, 0);  
      }
      msg.isProcessed = true;
      await sys.anslq25Board.sendAsync(response);
    }
    catch (err) {
      logger.error(`ANSLQ25 error processing IS4/IS10 packet.  ${err.message}`);
    }
  };
  public async processQuickTouchRemoteAsync(msg: Inbound) {
    try {
      // 33/161/225
      let response: Outbound = Outbound.create({
        action: 33,
        portId: msg.portId,
        protocol: msg.protocol,
        dest: msg.source,
        source: 16 //msg.dest
      });
      response.appendPayloadBytes(0, 4);
      let remote = sys.remotes.getItemById(6);
      response.setPayloadByte(0, remote.button1, 0);
      response.setPayloadByte(1, remote.button2, 0);
      response.setPayloadByte(2, remote.button3, 0);
      response.setPayloadByte(3, remote.button4, 0);
      msg.isProcessed = true;
      await sys.anslq25Board.sendAsync(response);
    }
    catch (err) {
      logger.error(`ANSLQ25 error processing quicktouch remote packet.  ${err.message}`);
    }
  };
  public async processSpaCommandRemoteAsync(msg: Inbound) {
    try {
      // 22/150/214
      let response: Outbound = Outbound.create({
        action: 22,
        portId: msg.portId,
        protocol: msg.protocol,
        dest: msg.source,
        source: 16 //msg.dest
      });
      response.appendPayloadBytes(0, 16);
      let remote = sys.remotes.getItemById(7);
      response.setPayloadByte(5, remote.pumpId, 0);
      response.setPayloadByte(6, remote.stepSize, 0);
      msg.isProcessed = true;
      await sys.anslq25Board.sendAsync(response);
    }
    catch (err) {
      logger.error(`ANSLQ25 error processing spa command remote packet.  ${err.message}`);
    }
  };
}

export class EasyTouchMockPumpCommands extends MockPumpCommands {
  public async processPumpConfigAsync(msg: Inbound) {
    try {
      // 24/152/212 and 27/155/215(?)
      // [255, 0, 255], [165, 33, 15, 16, 27, 46], [2, 6, 15, 2, 0, 1, 29, 11, 35, 0, 30, 0, 30, 0, 30, 0, 30, 0, 30, 0, 30, 30, 55, 5, 10, 60, 5, 1, 50, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [3, 41]
      let response: Outbound = Outbound.create({
        action: 24,
        portId: msg.portId,
        protocol: msg.protocol,
        dest: msg.source,
        source: 16 //msg.dest
      });
      response.appendPayloadBytes(0, 46);
      let pump = sys.pumps.getItemById(msg.payload[0]);
      response.setPayloadByte(0, pump.id);
      response.setPayloadByte(1, pump.type, 0);
      switch (pump.type) {
        case 0: //none
          {
            break;
          }
        case 1: // vf
          {
            let pumpCircuits = pump.circuits.get();
            for (let circuitId = 1; circuitId <= sys.board.valueMaps.pumpTypes.get(pump.type).maxCircuits; circuitId++) {
              let pumpCircuit: PumpCircuit = pumpCircuits[circuitId];
              if (pumpCircuit.circuit > 0) {
                response.setPayloadByte(circuitId * 2 + 3, pumpCircuit.circuit, 0);
                response.setPayloadByte(circuitId * 2 + 4, pumpCircuit.flow, 30);
              }
              response.setPayloadByte(1, pump.backgroundCircuit, 0);
              response.setPayloadByte(2, pump.filterSize / 1000, 0);
              response.setPayloadByte(3, pump.turnovers, 0);
              response.setPayloadByte(21, pump.manualFilterGPM, 0);
              response.setPayloadByte(22, pump.primingSpeed, 0);
              // response.setPayloadByte(23, pump.primingTime, 0);
              response.setPayloadByte(23, pump.primingTime | (pump.maxSystemTime << 4), 0);
              response.setPayloadByte(24, pump.maxPressureIncrease, 0);
              response.setPayloadByte(25, pump.backwashFlow, 0);
              response.setPayloadByte(26, pump.backwashTime, 0);
              response.setPayloadByte(27, pump.rinseTime, 0);
              response.setPayloadByte(28, pump.vacuumFlow, 0);
              response.setPayloadByte(30, pump.vacuumTime, 0);

            }
            break;
          }
        case 64: // vsf
          {
            let pumpCircuits = pump.circuits.get();
            for (let circuitId = 1; circuitId <= sys.board.valueMaps.pumpTypes.get(pump.type).maxCircuits; circuitId++) {
              let pumpCircuit: PumpCircuit = pumpCircuits[circuitId];
              if (pumpCircuit.circuit > 0) {
                response.setPayloadByte(4, pumpCircuit.units << circuitId - 1 | response.payload[4], response.payload[4]);
                if (pumpCircuit.units) {
                  response.setPayloadByte(circuitId * 2 + 4, pumpCircuit.flow, response.payload[4]);

                }
                else {
                  response.setPayloadByte(circuitId * 2 + 4, pumpCircuit.speed - (pumpCircuit.speed % 256) / 256, 0);
                  response.setPayloadByte(circuitId + 21, pumpCircuit.speed % 256, 0);
                }
              }
            }
            break;
          }
        case 128: // vs
        case 169: //vs+svrs
          {
            let pumpCircuits = pump.circuits.get();
            for (let circuitId = 1; circuitId <= sys.board.valueMaps.pumpTypes.get(pump.type).maxCircuits; circuitId++) {
              let pumpCircuit: PumpCircuit = pumpCircuits[circuitId];
              if (pumpCircuit.circuit > 0) {

                response.setPayloadByte(circuitId * 2 + 4, pumpCircuit.speed - (pumpCircuit.speed % 256) / 256, 0);
                response.setPayloadByte(circuitId + 21, pumpCircuit.speed % 256, 0);
              }
            }
            break;
          }
      }
      msg.isProcessed = true;
      await sys.anslq25Board.sendAsync(response);
    }
    catch (err) {
      logger.error(`ANSLQ25 error processing spa command remote packet.  ${err.message}`);
    }
  };
  public async processHighSpeedCircuitsAsync(msg: Inbound) {
    try {
      // 30/158/222
      let response: Outbound = Outbound.create({
        action: 30,
        portId: msg.portId,
        protocol: msg.protocol,
        dest: msg.source,
        source: 16 //msg.dest
      });
      response.appendPayloadBytes(0, 16);
      let pump = sys.pumps.getDualSpeed();
      let pumpCircuits = pump.circuits.get();
      for (let i = 1; i <= pumpCircuits.length; i++) {
        response.setPayloadByte(i, pumpCircuits[i].circuit, 0);
      }
      msg.isProcessed = true;
      await sys.anslq25Board.sendAsync(response);
    }
    catch (err) {
      logger.error(`ANSLQ25 error processing spa command remote packet.  ${err.message}`);
    }
  };
};
