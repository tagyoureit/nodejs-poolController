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

import { logger } from "../../logger/Logger";
import { setTimeout as setTimeoutSync } from 'timers';
import { Inbound, Outbound, Protocol } from "../../controller/comms/messages/Messages";
import { byteValueMap, byteValueMaps, SystemBoard } from "../../controller/boards/SystemBoard";
import { Anslq25, PoolSystem, sys } from "../../controller/Equipment";
import { ControllerType, utils } from "../../controller/Constants";
import { conn } from "../../controller/comms/Comms";
import { MockEasyTouch } from "./MockEasyTouchBoard";

export class MockSystemBoard {
  public valueMaps: byteValueMaps = new byteValueMaps();
  protected _statusTimer: NodeJS.Timeout;
  protected _statusCheckRef: number = 0;
  protected _statusInterval: number = 5000;
  constructor(system: PoolSystem) {
    // sys.anslq25.portId = 0; // pass this in.
    setTimeout(() => {
      this.processStatusAsync().then(() => { });
    }, 5000);
  }
  public expansionBoards: byteValueMap = new byteValueMap();
  public get statusInterval(): number { return this._statusInterval };
  public system: MockSystemCommands = new MockSystemCommands(this);
  public circuits: MockCircuitCommands = new MockCircuitCommands(this);
  public schedules: MockScheduleCommands = new MockScheduleCommands(this);
  public heaters: MockHeaterCommands = new MockHeaterCommands(this);
  public valves: MockValveCommands = new MockValveCommands(this);
  public remotes: MockRemoteCommands = new MockRemoteCommands(this);
  public pumps: MockPumpCommands = new MockPumpCommands(this);
  public static convertOutbound(outboundMsg: Outbound) { };
  public async sendAsync(msg: Outbound){
    return await msg.sendAsync();
    // is the controller on a real/physical port or a mock port?
/*     let port = conn.findPortById(sys.anslq25.portId);
    if (port.mockPort) {
      let inbound = new Inbound();
      inbound.protocol = msg.protocol;
      inbound.header = msg.header;
      inbound.payload = msg.payload;
      inbound.term = msg.term;
      inbound.portId = msg.portId;
      // don't need to wait for packet to process
      setTimeout(()=>{conn.sendMockPacket(inbound)}, 10);
      return Promise.resolve();
    }
    else {
      return await msg.sendAsync();
    } */
  }
  public process(msg: Inbound): Outbound { return new Outbound(Protocol.Broadcast,0,0,0,[]); }
  protected killStatusCheck() {
    if (typeof this._statusTimer !== 'undefined' && this._statusTimer) clearTimeout(this._statusTimer);
    this._statusTimer = undefined;
    this._statusCheckRef = 0;
  }
  public suspendStatus(bSuspend: boolean) {
    // The way status suspension works is by using a reference value that is incremented and decremented
    // the status check is only performed when the reference value is 0.  So suspending the status check 3 times and un-suspending
    // it 2 times will still result in the status check being suspended.  This method also ensures the reference never falls below 0.
    if (bSuspend) this._statusCheckRef++;
    else this._statusCheckRef = Math.max(0, this._statusCheckRef - 1);
    if (this._statusCheckRef > 1) logger.verbose(`Suspending ANSLQ25 status check: ${bSuspend} -- ${this._statusCheckRef}`);
  }
  public async setAnslq25Async(data: any): Promise<Anslq25> {
    let self = this;
    try {
      this.suspendStatus(true);
      // if (typeof data.isActive === 'undefined') return Promise.reject(`Mock System Board: No isActive flag provided.`);
      if (typeof data.anslq25portId === 'undefined') return Promise.reject(new Error(`Mock System Board: No portId provided.`));
      if (typeof data.anslq25ControllerType === 'undefined') return Promise.reject(new Error(`Mock System Board: No controller type provided.`));
      if (typeof data.anslq25model === 'undefined') return Promise.reject(new Error(`Mock System Board: No model provided.`));
      //for (let i = 1; i <= )
      let isActive = true; // utils.makeBool(data.isActive);
      let portId = parseInt(data.anslq25portId, 10);
      let port = conn.findPortById(portId);
      if (typeof port === 'undefined') return Promise.reject(new Error(`Mock System Board: Invalid portId provided.`));
      if (portId === 0) return Promise.reject(new Error(`Please choose a port other than the primary port.`));
      let mockControllerType = data.anslq25ControllerType;
      let model = parseInt(data.anslq25model, 10);
      let broadcastComms = data.broadcastComms;
      if (typeof broadcastComms === 'undefined') return Promise.reject(new Error(`A value for broadcast comms must be provided.`));
      sys.anslq25.portId = portId;
      sys.anslq25.broadcastComms = broadcastComms;
      switch (mockControllerType) {
        case ControllerType.EasyTouch:{
          sys.anslq25ControllerType = ControllerType.EasyTouch;
          // (sys.anslq25Board as MockEasyTouch).initExpansionModules(model);
          break;
        }
        default: {
          logger.warn(`No ANSLQ25 Mock Board definiton yet for: ${mockControllerType}`);
          return Promise.reject(new Error(`No ANSLQ25 Mock Board definiton yet for: ${mockControllerType}`));
        }
      }
      sys.anslq25.isActive = isActive;
      sys.anslq25.model = model;

    } catch (err) {
      logger.error(`Error changing port id: ${err.message}`);
    }
    finally {
      this.suspendStatus(false);
      this._statusTimer = setTimeoutSync(async () => await self.processStatusAsync(), this.statusInterval);
    }
  }
  public async deleteAnslq25Async(data: any)  {
    try {

      this.killStatusCheck();
      this.closeAsync();
      sys.anslq25.isActive = false;
      sys.anslq25.portId = undefined;
      sys.anslq25.model = undefined;
      sys.anslq25ControllerType = ControllerType.None;
    }
    catch (err){

    }
    finally {
      this.suspendStatus(false);
    }

  }

  public async processStatusAsync() {
    let self = this;
    try {
      if (this._statusCheckRef > 0) return;
      this.suspendStatus(true);
     
      await sys.anslq25Board.system.sendStatusAsync();
    }
    catch (err) {
      logger.error(`Error running mock processStatusAsync: ${err}`);
    }
    finally {
      this.suspendStatus(false);
      if (sys.anslq25.isActive){
        if (this.statusInterval > 0) this._statusTimer = setTimeoutSync(async () => await self.processStatusAsync(), this.statusInterval);
      }

    }
  }
  // public async setPortId(portId: number) {
  //   let self = this;
  //   try {
  //     this.suspendStatus(true);
  //     sys.anslq25.portId = portId;

  //   } catch (err) {
  //     logger.error(`Error changing port id: ${err.message}`);
  //   }
  //   finally {
  //     this.suspendStatus(false);
  //     this._statusTimer = setTimeoutSync(async () => await self.processStatusAsync(), this.statusInterval);
  //   }
  // }
  public async closeAsync() {
    try {
    }
    catch (err) { logger.error(err); }
  }
}
export class MockBoardCommands {
  protected mockBoard: MockSystemBoard = null;
  constructor(parent: MockSystemBoard) { this.mockBoard = parent; }
}
export class MockSystemCommands extends MockBoardCommands {
  public sendAck(msg:Inbound) {  };
  public async processDateTimeAsync(msg: Inbound){  };
  public async processCustomNameAsync(msg: Inbound){  };
  public async processSettingsAsync(msg: Inbound){  };
  public async sendStatusAsync() { };
}

export class MockCircuitCommands extends MockBoardCommands {
  public async processCircuitAsync( msg: Inbound) { };
  public async processLightGroupAsync( msg: Inbound) { };
}
export class MockScheduleCommands extends MockBoardCommands {
  public async processScheduleAsync( msg: Inbound) { };
}
export class MockHeaterCommands extends MockBoardCommands {
  public async processHeatModesAsync(msg: Inbound) { };
  public async processHeaterConfigAsync(msg: Inbound) { };
}
export class MockValveCommands extends MockBoardCommands {
  public async processValveOptionsAsync(msg: Inbound) { };
  public async processValveAssignmentsAsync(msg: Inbound) { };
}
export class MockRemoteCommands extends MockBoardCommands {
  public async processIS4IS10RemoteAsync(msg: Inbound) { };
  public async processQuickTouchRemoteAsync(msg: Inbound) { };
  public async processSpaCommandRemoteAsync(msg: Inbound) { };
}
export class MockPumpCommands extends MockBoardCommands {
  public async processPumpConfigAsync(msg: Inbound) { };
  public async processHighSpeedCircuitsAsync(msg: Inbound) { };
}