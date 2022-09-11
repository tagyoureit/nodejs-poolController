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
import { Outbound } from "controller/comms/messages/Messages";
import { SystemBoard } from "../../controller/boards/SystemBoard";
import { PoolSystem, sys } from "../../controller/Equipment";

export class MockSystemBoard {
  protected _statusTimer: NodeJS.Timeout;
  protected _statusCheckRef: number = 0;
  protected _statusInterval: number = 3000;
  constructor(system: PoolSystem){
    // sys.anslq25.portId = 0; // pass this in.
    setTimeout(()=>{
      this.processStatusAsync().then(()=>{});
    }, 5000);
  }
  public get statusInterval(): number { return this._statusInterval };
  public system: MockSystemCommands = new MockSystemCommands(this);
  public status: MockStatusCommands = new MockStatusCommands(this);
  public convertOutbound(outboundMsg: Outbound) {};
  protected killStatusCheck() {
    if (typeof this._statusTimer !== 'undefined' && this._statusTimer) clearTimeout(this._statusTimer);
    this._statusTimer = undefined;
  }
  public suspendStatus(bSuspend: boolean) {
    // The way status suspension works is by using a reference value that is incremented and decremented
    // the status check is only performed when the reference value is 0.  So suspending the status check 3 times and un-suspending
    // it 2 times will still result in the status check being suspended.  This method also ensures the reference never falls below 0.
    if (bSuspend) this._statusCheckRef++;
    else this._statusCheckRef = Math.max(0, this._statusCheckRef - 1);
    if (this._statusCheckRef > 1) logger.verbose(`Suspending status check: ${bSuspend} -- ${this._statusCheckRef}`);
}
  public async processStatusAsync() {
    let self = this;
    try {
      if (!sys.anslq25.isActive || typeof sys.anslq25.mockControllerType === 'undefined') this.closeAsync();
      if (this._statusCheckRef > 0) return;
      this.suspendStatus(true);
      if (typeof this._statusTimer !== 'undefined' && this._statusTimer) clearTimeout(this._statusTimer);
      await this.status.processStatusAsync();
    }
    catch (err){
      logger.error(`Error running mock processStatusAsync: ${err}`);
      this.suspendStatus(false);
      if (this.statusInterval > 0) this._statusTimer = setTimeoutSync(async () => await self.processStatusAsync(), this.statusInterval);
    }
  }
  public async setPortId(portId: number) {
    let self = this;
    try {
      this.killStatusCheck();
      this.suspendStatus(true);
      sys.anslq25.portId = portId;
      
    } catch (err) {
      logger.error(`Error changing port id: ${err.message}`);
    }
    finally {
      this.suspendStatus(false);
      this._statusTimer = setTimeoutSync(async () => await self.processStatusAsync(), this.statusInterval);
    }
  }
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
export class MockSystemCommands extends MockBoardCommands{

}
export class MockStatusCommands extends MockBoardCommands{
  public sendAck(outboundMsg, response){};
    public async processStatusAsync(responseoutbound?: Outbound) {};
}