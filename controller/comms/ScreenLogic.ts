import { ControllerType, utils } from '../../controller/Constants';
import { LightGroup, LightGroupCircuit, sys, Valve } from '../../controller/Equipment';
import { CircuitState, state, ValveState } from '../../controller/State';
import * as ScreenLogic from 'node-screenlogic';
import { SLControllerConfigData, SLEquipmentConfigurationData, Valves, type HeaterConfig } from 'node-screenlogic/dist/messages/state/EquipmentConfig';
import { EasyTouchBoard } from '../../controller/boards/EasyTouchBoard';
import { IntelliTouchBoard } from '../../controller/boards/IntelliTouchBoard';
import { logger } from '../../logger/Logger';
import { SLSystemTimeData } from 'node-screenlogic/dist/messages/state/EquipmentConfig';
import { SLIntellichlorData } from 'node-screenlogic/dist/messages/state/ChlorMessage';
import { SLChemData } from 'node-screenlogic/dist/messages/state/ChemMessage';
import { SLScheduleData } from 'node-screenlogic/dist/messages/state/ScheduleMessage';
import { webApp } from '../../web/Server';
import { SLPumpStatusData } from 'node-screenlogic/dist/messages/state/PumpMessage';
import { delayMgr } from '../../controller/Lockouts';
import { SLEquipmentStateData } from 'node-screenlogic/dist/messages/state/EquipmentState';
import { config } from '../../config/Config';
import { InvalidEquipmentDataError, InvalidEquipmentIdError } from '../../controller/Errors';
import extend = require('extend');


// Todo - service, timeout?  

export class ScreenLogicComms {
  constructor() {
    this._client = ScreenLogic.screenlogic;
  };
  public counter: SLCounter = new SLCounter();
  private _gateway: ScreenLogic.RemoteLogin;
  private _client: ScreenLogic.UnitConnection;
  private _pollTimer: NodeJS.Timeout;
  public circuits: SLCircuits;
  private _pollCountError: number = 0;
  public isOpen: boolean = false;
  private _cfg: any;
  private pollingInterval = 10000;
  public enabled: boolean = false;

  public async initAsync() {
    this.circuits = new SLCircuits(this._client);
    let cfg = config.getSection('controller.screenlogic');
    if (typeof cfg !== 'undefined') this._cfg = cfg;
    this.enabled = this._cfg.enabled;
    if (!this._cfg.enabled) {
      return;
    }

    let systemName = this._cfg.systemName; // 'Pentair: 00-00-00';
    let password = this._cfg.password; // '1111';

    this._gateway = new ScreenLogic.RemoteLogin(systemName);
    this._gateway.on('error', async (err) => {
      logger.error(`Screenlogic Gateway Error: ${err.message}`);
      this.isOpen = false;
      await this._gateway.closeAsync();
      return Promise.resolve(false);
    })
    let unit = await this._gateway.connect();

    if (!unit || !unit.gatewayFound || unit.ipAddr === '') {
      logger.error(`Screenlogic: No unit found called ${systemName}`);
      this.isOpen = false;
      return;
    }
    await this._gateway.closeAsync();
    this.isOpen = true;
    logger.info(`Screenlogic: Unit ${this._gateway.systemName} found at ${unit.ipAddr}:${unit.port}`);

    let delayCount = 0;
    state.status = sys.board.valueMaps.controllerStatus.transform(0, 0);
    state.emitControllerChange();

    try {
      this._client.init(unit.ipAddr, unit.port, password, Math.min(Math.max(1, Math.trunc(Math.random() * 10000)), 10000));  // fix - can remove senderid with next push - will be assigned randomly
      await this._client.connectAsync();
      let ver = await this._client.getVersionAsync();
      logger.info(`Screenlogic: connect to ${systemName} ${ver} at ${unit.ipAddr}:${unit.port}`);
      let addClient = await this._client.addClientAsync();
      console.log(`Add client result: ${addClient}`);

      let customNames = await this._client.equipment.getCustomNamesAsync();
      console.log(customNames);
      let equipConfig = await this._client.equipment.getEquipmentConfigurationAsync();
      console.log(`Equipment config: ${JSON.stringify(equipConfig, null, 2)}`);
      await Controller.decodeEquipment(equipConfig);
      let controller = await this._client.equipment.getControllerConfigAsync();
      await Controller.decodeCustomNames(customNames);
      console.log(`Controller: ${JSON.stringify(controller, null, 2)}`);
      await Controller.decodeController(controller);
      let systemTime = await this._client.equipment.getSystemTimeAsync();
      // console.log(`System Time: ${JSON.stringify(systemTime)}`)
      Controller.decodeDateTime(systemTime);
      // PUMPS
      let pumpArr = sys.pumps.get();
      for (let i = 0; i < pumpArr.length; i++){
        let pumpStatus = await this._client.pump.getPumpStatusAsync(i);
        console.log(`Pump ${i+1}: ${JSON.stringify(pumpStatus)}`);
        await Controller.decodePump(i+1, pumpStatus);
      }
      // pumpStatus = await client.pump.getPumpStatus(1);
      // console.log(`Pump 21 ${JSON.stringify(pumpStatus)}`);
      let recurringSched = await this._client.schedule.getScheduleDataAsync(0);
      console.log(`reccuring schedules: ${JSON.stringify(recurringSched)}`);

      let runOnceSched = await this._client.schedule.getScheduleDataAsync(1);
      console.log(`Run once schedules: ${JSON.stringify(runOnceSched)}`);
      await Controller.decodeSchedules(recurringSched, runOnceSched);

      let intellichlor = await this._client.chlor.getIntellichlorConfigAsync();
      // console.log(`Intellichlor: ${JSON.stringify(intellichlor)}`);
      await Controller.decodeIntellichlor(intellichlor);
      let chem = await this._client.chem.getChemicalDataAsync();
      console.log(`Chem data: ${JSON.stringify(chem)}`);
      await Controller.decodeChemController(chem);

      let equipmentState = await this._client.equipment.getEquipmentStateAsync();
      console.log(equipmentState);
      await Controller.decodeEquipmentState(equipmentState);
      // state.mode = 0;
      // webApp.emitToClients('panelMode', { mode: state.mode, remaining: 0 });
      state.status = sys.board.valueMaps.controllerStatus.transform(1, 100);
      sys.board.circuits.syncVirtualCircuitStates()
      state.emitControllerChange();

      this._client.on('equipmentState', async function (data) { await Controller.decodeEquipmentState(data); })
      this._client.on('intellichlorConfig', async function (data) {
        await Controller.decodeIntellichlor(data);
      });
      this._client.on('equipmentConfig', async function (data) {
        await Controller.decodeEquipment(data);
      });
      this._client.on('chemicalData', async function (data) {
        await Controller.decodeChemController(data);

      });
      this._client.on('getSystemTime', async function (data) {
        Controller.decodeDateTime(data);
      });
      //client.on('getScheduleData', async function(){await Controller.decodeSchedules(recurringSched, runOnceSched);});  // how do we know if this is recurring or runonce?  Investigate.
      this._client.on('cancelDelay', async function (data) {
        console.log(`cancelDelay: ${data}`)
      }) // not programmed yet});
      this._client.on('equipmentConfiguration', async function (data) {
        console.log(`equipConfig ${data}`)
      })// which one?});
      this._client.on('getPumpStatus', async function (data) {
        console.log(`getPumpStatus: ${JSON.stringify(data)}`);
        // await Controller.decodePump(1, pumpStatus);
      });  // how do we know which pump id?  Investigate.
      this._client.on('weatherForecast', async function (data) {
        console.log(`weatherforecast: ${JSON.stringify(data)}`)
      });
      this._client.on('circuitStateChanged', async function (data) {
        console.log(`circuitstatechanged: ${JSON.stringify(data)}`)
      });
      this._client.on('setPointChanged', async function (data) {
        console.log(`setpointchanged: ${JSON.stringify(data)}`)
      });

      // not working

      this._client.on('heatModeChanged', async function (data) {
        console.log(`heat mode changed: ${JSON.stringify(data)}`);
      });
      this._client.on('intellibriteDelay', async function (data) {
        console.log(`intellibrite delay: ${JSON.stringify(data)}`)
      });
      this._client.on('weatherForecastChanged', async function () {
        console.log(`weather forecast changed}`);
        // found - no data returned; need to request data
      });
      // No data comes through... maybe need to request weather data again?
      this._client.on('scheduleChanged', async function (data) {
        console.log(`schedule changed: ${JSON.stringify(data)}`);
        let recurringSched = await this._client.schedule.getScheduleData(0);
        console.log(`reccuring schedules: ${JSON.stringify(recurringSched)}`);

        let runOnceSched = await this._client.schedule.getScheduleData(1);
        console.log(`Run once schedules: ${JSON.stringify(runOnceSched)}`);
        await Controller.decodeSchedules(recurringSched, runOnceSched);
      });
      this._client.on('error', (e) => {
        // if the error event from the net.socket isn't caught, it sometimes crashes the app.
        logger.error(`Screenlogic error (net.socket): ${e.message}`);
      })
      this._client.on('clientError', (e) => {
        // if the error event from the net.socket isn't caught, it sometimes crashes the app.
        logger.error(`Screenlogic client error (net.socket): ${e.message}`);
      })
      this._client.on('loginFailed', (data) => {
        logger.error(`Screenlogic login failed.  Invalid password.`);
        this.isOpen = false;
      })
      this._client.on('bytesRead', (bytes) => {
        console.log(`SL Bytes Read: ${bytes}`);
        this.counter.bytesReceived += bytes;
        this.emitScreenlogicStats();
      });
      this._client.on('bytesWritten', (bytes) => {
        console.log(`SL Bytes written: ${bytes}`);
        this.counter.bytesSent += bytes;
        this.emitScreenlogicStats();
      });
      this.pollAsync();
      // console.log(`Equipment State: ${JSON.stringify(equipmentState, null, 2)}`);
      /* // EQUIPMENT
      
      
      let cancelDelay = await client.equipment.cancelDelay();
      console.log(`Cancel delay: ${cancelDelay}`);
      let weatherForecast = await client.equipment.getWeatherForecast();
      console.log(`Weather: ${JSON.stringify(weatherForecast)}`); 
      let sysTime = await screenlogic.equipment.setSystemTime(dt, true);
      console.log(`set time result: ${sysTime}`);
      let hist = await screenlogic.equipment.getHistoryData()
      console.log(`history data: ${JSON.stringify(hist)}`)
      
      // CHLOR
      let chlorOutput = await client.chlor.setIntellichlorOutput(12,0);
      console.log(`Chlor output: ${JSON.stringify(chlorOutput)}`)
      
      // CHEM
      let chemHist = await screenlogic.chem.getChemHistoryData()
      console.log(`history data: ${JSON.stringify(chemHist)}`)
      
      // SCHEDULES
      
      let addSched = await client.schedule.addNewScheduleEvent(SchedTypes.RECURRING);
      console.log(`Add sched response: ${addSched}`);
      let setSched = await client.schedule.setScheduleEventById(10, 2,500,1200,127,0,1,99);
      console.log(`Set sched result: ${setSched}`);
      let delSched = await client.schedule.deleteScheduleEventById(10);
      console.log(`Deleted sched result: ${delSched}`);

      // PUMPS
      // let pumpRes = await client.pump.setPumpSpeed(0,1,2000,true);
      // console.log(`Pump speed response: ${pumpRes}`)
      
      // BODIES
      let setPointChanged = await client.bodies.setSetPoint(1, 101)
      console.log(`set point changed: ${setPointChanged}`);
      let heatModeRes = await client.bodies.setHeatMode(1, HeatModes.HEAT_MODE_HEATPUMP);
      console.log(`heat mode result: ${heatModeRes}`);
      
      // CIRCUITS
      let lightRes = await client.circuits.sendLightCommand(LightCommands.LIGHT_CMD_COLOR_MODE_PARTY);
      console.log(`Light result: ${lightRes}`);
      //     
      let circRun = await client.circuits.setCircuitRuntimebyId(4, 5);
      console.log(`circ run res: ${circRun}`);
   */
      // setTimeout(async () => {
      //   console.log(`closing connection after 60s`);
      //   await client.closeAsync();
      // }, 120 * 1000)
      // let close = await client.closeAsync();
      // console.log(`client closed: ${close}`);
    } catch (error) {
      logger.error(`Screenlogic error: ${error.message}`);
      await this._client.closeAsync();
      return Promise.resolve(error);
    }
  }
  public async stopAsync() {
    await this._client.closeAsync();
    this._client.removeAllListeners();
    this.isOpen = false;
    if (typeof this._pollTimer !== 'undefined') clearTimeout(this._pollTimer);
    this._pollTimer = null;
  }
  public async setScreenlogicAsync(data) {
    let enabled = typeof data.enabled !== 'undefined' ? utils.makeBool(data.enabled) : false;
    let systemName = typeof data.systemName !== 'undefined' ? data.systemName : this._cfg.systemName;
    let password = typeof data.password !== 'undefined' ? data.password : this._cfg.password;
    let regx = /Pentair: (?:(?:\d|[A-Z])(?:\d|[A-Z])-){2}(?:\d|[A-Z])(?:\d|[A-Z])/g;
    let type = typeof data.type !== 'undefined' ? data.type : this._cfg.type;
    if (type !== 'remote' && type !== 'local') return Promise.reject(new InvalidEquipmentDataError(`An invalid type was supplied for Screenlogic ${type}.  Must be remote or local.`, 'Screenlogic', data));
    if (systemName.match(regx) === null) return Promise.reject(new InvalidEquipmentDataError(`An invalid system name was supplied for Screenlogic ${systemName}}.  Must be in the format 'Pentair: xx-xx-xx'.`, 'Screenlogic', data));
    if (password.length > 4) return Promise.reject(new InvalidEquipmentDataError(`An invalid password was supplied for Screenlogic ${password}. (Length must be <= 4)}`, 'Screenlogic', data));
    this.enabled = enabled;
    if (this._cfg.enabled && !enabled || this._cfg.systemName !== systemName || this._cfg.password !== password || this._cfg.cype !== type) {
      await this.stopAsync();
    }
    let obj = {
      enabled,
      type,
      systemName,
      password
    }
    config.setSection('controller.screenlogic', obj);
    this._cfg = config.getSection('controller.screenlogic');
    if (this._cfg.enabled) {
      let error = await this.initAsync();
      if (typeof error !== 'undefined') return Promise.reject(error);
    }

  }
  public async pollAsync() {
    let self = this;
    try {
      if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
      this._pollTimer = null;
      if (!this.isOpen) { return; };
      let numPumps = sys.pumps.get().length;
      for (let i = 1; i < numPumps + 1; i++) {
        let pumpStatus = await self._client.pump.getPumpStatusAsync(i - 1);
        console.log(`Pump ${i}: ${JSON.stringify(pumpStatus)}`);
        await Controller.decodePump(i, pumpStatus);
      }
    }
    catch (err) {
      logger.error(`Error polling screenlogic (${this._pollCountError} errors)- ${err}`); this._pollCountError++;
      if (this._pollCountError > 10) {
        await this.initAsync();
      }
    }
    finally { this._pollTimer = setTimeout(async () => await self.pollAsync(), this.pollingInterval || 10000); }
  }
  public static async searchAsync() {
    try {
      ``
      let finder = new ScreenLogic.FindUnits();
      let localUnit = await finder.searchAsync();
      return Promise.resolve(localUnit);
    }
    catch (err) {
      logger.error(`Screenlogic: Error searching for units: ${err.message}`);
      return Promise.reject(err);
    }
  }
  public get stats() {
    let status = this.isOpen ? 'open' : this._cfg.enabled ? 'closed' : 'disabled';
    let socketStatus = this._client.status();
    return extend(true, { status: status }, this.counter, socketStatus);
  }
  public emitScreenlogicStats() {
    webApp.emitToChannel('screenlogicStats', 'screenlogicStats', this.stats);
  }
}

class Controller {
  public static async decodeController(config: SLControllerConfigData) {
    sys.general.options.units = state.temps.units = config.degC ? sys.board.valueMaps.tempUnits.getValue('C') : sys.board.valueMaps.tempUnits.getValue('F');
    let lightGroup: any = { circuits: [] };
    let lgCircId = 1;
    for (let i = 0; i < config.circuitArray.length; i++) {
      let _circ = config.circuitArray[i];
      let data: any = {
        id: _circ.circuitId,
        type: _circ.function,
        nameId: _circ.nameIndex < 101 ? _circ.nameIndex + 1 : _circ.nameIndex + 99, // custom names are 100 off from the rs485 packets
        // name: _circ.name,  // determined from id
        // cstate.isActive = circuit.isActive = true, // added by setCircuitAsync
        freeze: _circ.freeze,
        eggTimer: _circ.eggTimer,
        showInFeatures: _circ.interface !== 4 && _circ.interface !== 5,  // 0 = pool; 1 = spa; 2 = features; 4 = lights; 5 = hide

      }
      if (_circ.function === 5) {
        let lgCirc = {
          color: _circ.colorSet,
          swimDelay: _circ.colorStagger,
          position: _circ.colorPos,
          id: lgCircId,
          ...data
        }
        lgCircId++;
        lightGroup.circuits.push(lgCirc, false);
      }
      await sys.board.circuits.setCircuitAsync(data, false);
    }
    if (lightGroup.circuits.length === 0) {
      sys.lightGroups.removeItemById(192);
      state.lightGroups.removeItemById(192);
    }
    else {
      lightGroup.id = 192;
      await sys.board.circuits.setLightGroupAsync(lightGroup, false);
    }

    // now go back through and remove and circuits that aren't in the received list
    let circuits = sys.circuits.get();
    for (let i = 0; i < circuits.length; i++) {
      let circuit = sys.circuits.getItemById(circuits[i].id);
      let _circ = config.circuitArray.find(el => { return el.circuitId === circuit.id });
      if (typeof _circ === 'undefined') {
        sys.circuits.removeItemById(circuit.id);
        state.circuits.removeItemById(circuit.id);
      }
    }
    let features = sys.features.get();
    for (let i = 0; i < features.length; i++) {
      let feature = sys.features.getItemById(features[i].id);
      let _circ = config.circuitArray.find(el => { return el.circuitId === feature.id });
      if (typeof _circ === 'undefined') {
        sys.features.removeItemById(feature.id);
        state.features.removeItemById(feature.id);
      }
    }

    /*       if (config.equipment.POOL_CHLORPRESENT) {
          let chlor = sys.chlorinators.getItemById(1, true);
          let chlorState = state.chlorinators.getItemById(1, true);
          chlorState.isActive = chlor.isActive = true;
        }
        else {
          sys.chlorinators.removeItemById(1);
          state.chlorinators.removeItemById(1);
        };  */
    if (config.equipment.POOL_IFLOWPRESENT0) {
      let pump = sys.pumps.getItemById(1, true);
      let sPump = state.pumps.getItemById(1, true);
      sPump.isActive = pump.isActive = true;
    }
    else {
      sys.pumps.removeItemById(1);
      state.pumps.removeItemById(1);
    };
    if (config.equipment.POOL_IFLOWPRESENT1) {
      let pump = sys.pumps.getItemById(2, true);
      let sPump = state.pumps.getItemById(2, true);
      sPump.isActive = pump.isActive = true;
    }
    else {
      sys.pumps.removeItemById(2);
      state.pumps.removeItemById(2);
    };
    if (config.equipment.POOL_IFLOWPRESENT2) {
      let pump = sys.pumps.getItemById(3, true);
      let sPump = state.pumps.getItemById(3, true);
      sPump.isActive = pump.isActive = true;
    }
    else {
      sys.pumps.removeItemById(3);
      state.pumps.removeItemById(3);
    };
    if (config.equipment.POOL_IFLOWPRESENT3) {
      let pump = sys.pumps.getItemById(4, true);
      let sPump = state.pumps.getItemById(4, true);
      sPump.isActive = pump.isActive = true;
    }
    else {
      sys.pumps.removeItemById(4);
      state.pumps.removeItemById(4);
    };
    if (config.equipment.POOL_IFLOWPRESENT4) {
      let pump = sys.pumps.getItemById(5, true);
      let sPump = state.pumps.getItemById(5, true);
      sPump.isActive = pump.isActive = true;
    }
    else {
      sys.pumps.removeItemById(5);
      state.pumps.removeItemById(5);
    };
    if (config.equipment.POOL_IFLOWPRESENT5) {
      let pump = sys.pumps.getItemById(6, true);
      let sPump = state.pumps.getItemById(6, true);
      sPump.isActive = pump.isActive = true;
    }
    else {
      sys.pumps.removeItemById(6);
      state.pumps.removeItemById(6);
    };
    if (config.equipment.POOL_IFLOWPRESENT6) {
      let pump = sys.pumps.getItemById(7, true);
      let sPump = state.pumps.getItemById(7, true);
      sPump.isActive = pump.isActive = true;
    }
    else {
      sys.pumps.removeItemById(7);
      state.pumps.removeItemById(7);
    };
    if (config.equipment.POOL_IFLOWPRESENT7) {
      let pump = sys.pumps.getItemById(8, true);
      let sPump = state.pumps.getItemById(8, true);
      sPump.isActive = pump.isActive = true;
    }
    else {
      sys.pumps.removeItemById(8);
      state.pumps.removeItemById(8);
    };

    /* // deal with these in other places
    if (config.equipment.POOL_NO_SPECIAL_LIGHTS) { }; // ?? Nothing to see here?
    if (config.equipment.POOL_MAGICSTREAMPRESENT) { }; // Ya, so what?
    if (config.equipment.POOL_IBRITEPRESENT) { };
    // set in equip message
    if (config.equipment.POOL_SOLARPRESENT) { };
    if (config.equipment.POOL_SOLARHEATPUMP) { };
    if (config.equipment.POOL_HEATPUMPHASCOOL) { };
    if (config.equipment.POOL_ICHEMPRESENT) { };  */
  }
  public static async decodeEquipmentState(eqstate: SLEquipmentStateData) {
    /*
  {
    ok: 0,
    freezeMode: 0,
    remotes: 32,
    poolDelay: 0,
    spaDelay: 0,
    cleanerDelay: 0,
    airTemp: 67,
    bodiesCount: 2,
    bodies: [
      {
        id: 1,
        currentTemp: 62,
        heatStatus: 0,
        setPoint: 79,
        coolSetPoint: 0,
        heatMode: 0
      },
      {
        id: 2,
        currentTemp: 64,
        heatStatus: 0,
        setPoint: 101,
        coolSetPoint: 67,
        heatMode: 3
      }
    ],
    circuitArray: [
      {
        id: 1,
        state: 0,
        colorSet: 0,
        colorPos: 0,
        colorStagger: 0,
        delay: 0
      },
   ...
    ],
    pH: 0,
    orp: 0,
    saturation: 0,
    saltPPM: 0,
    pHTank: 0,
    orpTank: 0,
    alarms: 0
  }
    */
         try {
    /*      public boolean isDeviceready() {
            return this.m_Ok == 1;
        }
    
        public boolean isDeviceSync() {
            return this.m_Ok == 2;
        }
    
        public boolean isDeviceServiceMode() {
            return this.m_Ok == 3;
        } */
    if (eqstate.ok === 1) {
      state.mode = 0; // ready
      state.status = sys.board.valueMaps.controllerStatus.transform(1);
    }
    else if (eqstate.ok === 2) {
      // syncronizing... 
      state.mode = 0;
      state.status = sys.board.valueMaps.controllerStatus.transform(2);
    }
    else if (eqstate.ok === 3) {
      // service mode
      state.mode = 1;
      state.status = sys.board.valueMaps.controllerStatus.transform(1);
    }
    if (eqstate.freezeMode) {
      state.mode = state.mode === 1 ? 1 : 8;
      state.freeze = true;
    }
    else {
      state.freeze = false;
    }

    // set delays
    if (eqstate.cleanerDelay) {
      let cleaner: CircuitState = state.circuits.find(elem => elem.type === 5);
      let bodyIsOn = state.temps.bodies.getBodyIsOn();
      let bodyId = bodyIsOn.circuit === 6 ? 1 : 2;
      delayMgr.setCleanerStartDelay(cleaner, bodyId, 60);
    }
    if (eqstate.poolDelay) { delayMgr.setManualPriorityDelay(state.circuits.getItemById(6)) };
    if (eqstate.spaDelay) { delayMgr.setManualPriorityDelay(state.circuits.getItemById(1)) };
    state.temps.air = eqstate.airTemp;
    for (let i = 0; i < eqstate.bodies.length; i++) {
      let slbody = eqstate.bodies[i];
      let tbody = state.temps.bodies.getItemById(i + 1);
      tbody.setPoint = slbody.setPoint;
      tbody.heatMode = slbody.heatMode;  // FIX - Heat mode and set point not working???
      tbody.heatStatus = slbody.heatStatus;
    }
    for (let i = 0; i < eqstate.circuitArray.length; i++) {
      let slcirc = eqstate.circuitArray[i];
      let cstate = state.circuits.getInterfaceById(slcirc.id);
      let slcircIsOn = utils.makeBool(slcirc.state);
      if (cstate.isOn !== slcircIsOn) {
        sys.board.circuits.setEndTime(sys.circuits.getItemById(cstate.id), cstate, slcircIsOn);
        cstate.isOn = slcircIsOn;
        if (cstate.id === 1 || cstate.id === 6) {
          let tbody = state.temps.bodies.getBodyByCircuitId(cstate.id);
          tbody.isOn = slcircIsOn;
        }
      }
      if (slcirc.delay) {
        // ??
      }
    }
    let schem = state.chemControllers.getItemById(1);
    if (schem.isActive) {
      /* pH: 0, 
      orp: 0,
      saturation: 0,
      saltPPM: 0,
      pHTank: 0,
      orpTank: 0,
      alarms: 0 */
      let address = 144;
      let chem = sys.chemControllers.getItemByAddress(address, true);
      let schem = state.chemControllers.getItemById(chem.id, true);
      schem.orp.level = eqstate.orp;
      schem.saturationIndex = eqstate.saturation;
      schem.ph.tank.level = eqstate.pHTank;
      schem.orp.tank.level = eqstate.orpTank;
      // saltPPM ==> set by intellichlor msg
      // schem.alarms. ==> Need alarm mapping...
      webApp.emitToClients('chemController', schem.getExtended()); // emit extended data
    }
    state.emitControllerChange();
    state.emitEquipmentChanges();
  } catch(err) {
    logger.error(`Caught error in decodeEquipmentState: ${err.message}`);
  }
}
  public static async decodeCustomNames(customNames: string[]) {
  for (let i = 0; i < sys.equipment.maxCustomNames; i++) {
    let data = {
      id: i,
      name: customNames[i]
    }
    try {

      await sys.board.system.setCustomNameAsync(data, false)
    }
    catch (err) {
      logger.error(`Error setting custom name ${JSON.stringify(data)}`);
    };
  }
}
  public static async decodeEquipment(equip: SLEquipmentConfigurationData) {
  if (sys.controllerType !== ControllerType.EasyTouch && Controller.isEasyTouch(equip.controllerType)) {
    sys.controllerType = ControllerType.EasyTouch;
    (sys.board as EasyTouchBoard).initExpansionModules(equip.controllerType, equip.hardwareType);
  }
  else if (sys.controllerType !== ControllerType.IntelliTouch && Controller.isIntelliTouch(equip.controllerType)) {
    sys.controllerType = ControllerType.IntelliTouch;
    (sys.board as IntelliTouchBoard).initExpansionModules(equip.controllerType, equip.hardwareType);
  }


  await Controller.decodeHeaters(equip.heaterConfig);
  await Controller.decodeValves(equip.valves);
  sys.general.options.pumpDelay = equip.delays.pumpOffDuringValveAction;
  if (equip.delays.poolPumpOnDuringHeaterCooldown) {
    for (let i = 0; i < sys.bodies.length; i++) {
      let bs = state.temps.bodies.getItemById(i + 1);
      bs.heaterCooldownDelay = true;
    }
  }

  if (equip.misc.intelliChem) {
    let chem = sys.chemControllers.getItemById(1, true);
    let schem = state.chemControllers.getItemById(1, true);
    schem.isActive = chem.isActive = true;
  }
  else {
    sys.chemControllers.removeItemById(1);
    state.chemControllers.removeItemById(1);
  }
  sys.equipment.controllerFirmware = `${Math.floor(equip.version / 1000).toString()}.${(equip.version % 1000).toString()}`;
}
  public static async decodeHeaters(heaterConfig: HeaterConfig) {
  let address: number;
  let id: number;
  let type: number = 1;
  let cooling: boolean = false;
  let body: number = 32;
  // how do we know the heater is a hybrid (type=4)??
  // if no hybrid, we do have a gas heater;  
  // it may not be possible to set a Hybrid heater from SL... 
  // will go with that until we learn otherwise 
  let data: any = {
    address,
    id,
    type,
    cooling,
    body
  }
  try {
    let heater = state.heaters.getItemById(1);
    if (heater.type === 0) {
      // to add a heater, id must be 0;
      // await sys.board.heaters.setHeaterAsync(data, false)
    }
    else {
      data.id = 1;
    }
    await sys.board.heaters.setHeaterAsync(data, false);
  }
  catch (err) {
    logger.error(`Error setting gas heater: ${err.message}`)
  }
  let add = false;
  if (heaterConfig.thermaFloPresent) {
    let heater = sys.heaters.getItemById(3);
    if (!heater.isActive) {
      data.address = 112;
      data.type = 3;
      if (heaterConfig.thermaFloCoolPresent) cooling = true;
      add = true;
    }
  }
  else if (heaterConfig.body1SolarPresent) {
    let heater = sys.heaters.getItemById(2);
    if (!heater.isActive) {
      data.type = 2;
      add = true;
    }
  }
  else if (heaterConfig.solarHeatPumpPresent) {
    let heater = sys.heaters.getItemById(3);
    if (!heater.isActive) {
      data.type = 3;
      add = true;
    }
  }
  if (add) {
    sys.board.heaters.setHeaterAsync(data, false).catch((err) => {
      logger.error(`Error setting additional heaters: ${err.message}`)
    });
  }
}
  public static async decodeValves(valves: Valves[]) {
  for (let i = 0; i < valves.length; i++) {
    let _valve = valves[i];
    // let valve: Valve = sys.valves.getItemById(_valve.valveIndex + 1);
    let data: any = {
      id: _valve.valveIndex + 1,
      name: _valve.valveName,
      circuit: _valve.deviceId,
    }
    await sys.board.valves.setValveAsync(data, false);
  }
  /*     "valves": [
        {
          "loadCenterIndex": 0,
          "valveIndex": 0,
          "valveName": "A",
          "loadCenterName": "1",
          "deviceId": 0
        },
        {
          "loadCenterIndex": 0,
          "valveIndex": 1,
          "valveName": "B",
          "loadCenterName": "1",
          "deviceId": 0
        }
      ], */
}
  public static async decodeIntellichlor(slchlor: SLIntellichlorData) {
  // Intellichlor: {"installed":false,"status":1,"poolSetPoint":12,"spaSetPoint":0,"salt":0,"flags":0,"superChlorTimer":0}
  let chlor = sys.chlorinators.getItemById(1);
  if (slchlor.installed) {
    let data: any = {
      id: chlor.isActive ? chlor.id : 0,
      superChlorHours: slchlor.superChlorTimer,
      poolSetpoint: slchlor.poolSetPoint,
      spaSetpoint: slchlor.spaSetPoint,
    }
    await sys.board.chlorinator.setChlorAsync(data, false);
    let chlorState = state.chlorinators.getItemById(1, true);
    chlorState.saltLevel = slchlor.salt;
    state.emitEquipmentChanges();
  }
  else {
    sys.chlorinators.removeItemById(1);
    state.chlorinators.removeItemById(1);
  };

}
  public static async decodeChemController(slchem: SLChemData) {
  // Chem data: {"isValid":true,"pH":0,"orp":0,"pHSetPoint":0,"orpSetPoint":0,"pHTankLevel":0,"orpTankLevel":0,"saturation":0,"calcium":0,"cyanuricAcid":0,"alkalinity":0,"saltPPM":0,"temperature":0,"balance":0,"corrosive":false,"scaling":false,"error":false}
  let data: any = {
    id: 1,
    address: 144,
    calciumHardness: slchem.calcium,
    cyanuricAcid: slchem.cyanuricAcid,
    alkalanity: slchem.alkalinity,
    body: 32,
    ph: {
      setpoint: slchem.pHSetPoint,
      enabled: true,
      tank: slchem.pHTankLevel
    },
    orp: {
      setpoint: slchem.orpSetPoint,
      enabled: true,
      tank: slchem.orpTankLevel
    },
    type: 2
  }
  let chem = sys.chemControllers.getItemById(1);
  if (chem.isActive) {
    let schem = state.chemControllers.getItemById(1);
    await sys.board.chemControllers.setChemControllerAsync(data, false);
    schem.ph.level = slchem.pH;
    schem.orp.level = slchem.orp;
    schem.saturationIndex = slchem.saturation;
    schem.alarms.bodyFault = slchem.error ? 1 : 0; // maybe a better place to assign the error? 
    state.emitEquipmentChanges();
  }
}
  public static async decodePump(id: number, slpump: SLPumpStatusData) {
  /*      Pump 0: {"pumpCircuits":[
              {"circuitId":6,"speed":2600,"isRPMs":true},
              {"circuitId":1,"speed":2000,"isRPMs":true},
              {"circuitId":2,"speed":2500,"isRPMs":true},
              {"circuitId":3,"speed":2800,"isRPMs":true},
              {"circuitId":11,"speed":2890,"isRPMs":true},
              {"circuitId":14,"speed":1500,"isRPMs":true},
              {"circuitId":129,"speed":2300,"isRPMs":true},
              {"circuitId":13,"speed":2860,"isRPMs":true}],
      "pumpType":2,
      "isRunning":true,
      "pumpWatts":0,
      "pumpRPMs":0,
      "pumpUnknown1":0,
      "pumpGPMs":255,
      "pumpUnknown2":255} */
  let pump = sys.pumps.getItemById(id, true);
  let ptype = 0;
  switch (slpump.pumpType as any) {
    case 2:
    case 3: //ScreenLogic.PumpTypes.PUMP_TYPE_INTELLIFLOVS:
      ptype = 128;
      break;
    case 5: //ScreenLogic.PumpTypes.PUMP_TYPE_INTELLIFLOVF:
      ptype = 1;
      break;
    case 4: //ScreenLogic.PumpTypes.PUMP_TYPE_INTELLIFLOVSF:
      ptype = 64;
      break;
  }
  let data = {
    type: ptype,
    name: pump.name || `Pump ${id}`,
    circuits: []
  };
  for (let i = 0; i < slpump.pumpCircuits.length; i++) {
    let pumpCirc = {
      circuit: slpump.pumpCircuits[i].circuitId,
      speed: slpump.pumpCircuits[i].isRPMs ? slpump.pumpCircuits[i].speed : undefined,
      flow: slpump.pumpCircuits[i].isRPMs ? undefined : slpump.pumpCircuits[i].speed
    }
    data.circuits[i] = pumpCirc;
  }
  data.type = ptype;
  data.name = typeof pump.name !== 'undefined' ? pump.name : `Pump ${id}`
  pump.set(data);
  // await sys.board.pumps.setPumpAsync(data, false);
  let pstate = state.pumps.getItemById(id, true);
  pstate.type = data.type;
  pstate.name = data.name;
  pstate.watts = slpump.pumpWatts;
  pstate.rpm = slpump.pumpRPMs;
  pstate.flow = slpump.pumpGPMs === 255 ? 0 : slpump.pumpGPMs;
  pstate.command = (pstate.rpm > 0 || pstate.watts > 0) ? 10 : 0;
  state.emitEquipmentChanges();

}
  public static async decodeSchedules(slrecurring: SLScheduleData[], slrunonce: SLScheduleData[]) {
  /*     reccuring schedules: [{"scheduleId":1,"circuitId":6,"startTime":"1800","stopTime":"0700","dayMask":127,"flags":0,"heatCmd":4,"heatSetPoint":70,"days":["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]},
  
  {"scheduleId":4,"circuitId":2,"startTime":"1800","stopTime":"2300","dayMask":127,"flags":0,"heatCmd":0,"heatSetPoint":0,"days":["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]},{"scheduleId":11,"circuitId":6,"startTime":"0800","stopTime":"1700","dayMask":127,"flags":0,"heatCmd":4,"heatSetPoint":70,"days":["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]}]
  
      Run once schedules: [{"scheduleId":12,"circuitId":6,"startTime":"0800","stopTime":"1100","dayMask":1,"flags":1,"heatCmd":4,"heatSetPoint":70,"days":["Mon"]},{"scheduleId":13,"circuitId":6,"startTime":"0800","stopTime":"1100","dayMask":1,"flags":1,"heatCmd":4,"heatSetPoint":70,"days":["Mon"]}] */

  for (let i = 0; i < slrecurring.length; i++) {
    let slsched = slrecurring[i];
    let data = {
      id: slsched.scheduleId,
      circuit: slsched.circuitId,
      startTime: Math.floor(slsched.startTime / 100) * 60 + slsched.startTime % 100,
      endTime: Math.floor(slsched.stopTime / 100) * 60 + slsched.stopTime % 100,
      scheduleDays: slsched.dayMask,
      changeHeatSetPoint: slsched.heatCmd > 0,
      heatSetPoint: slsched.heatSetPoint,
      schedType: 128 // recurring
    }
    try {
      await sys.board.schedules.setScheduleAsync(data, false)
    } catch (err) {
      logger.error(`Error setting schedule ${slsched.scheduleId}.  ${err.message}`);
    }
  }
  for (let i = 0; i < slrunonce.length; i++) {
    let slsched = slrunonce[i];
    let data = {
      id: slsched.scheduleId,
      circuit: slsched.circuitId,
      startTime: Math.floor(slsched.startTime / 100) * 60 + slsched.startTime % 100,
      endTime: Math.floor(slsched.stopTime / 100) * 60 + slsched.stopTime % 100,
      scheduleDays: slsched.dayMask,
      changeHeatSetPoint: slsched.heatCmd > 0,
      heatSetPoint: slsched.heatSetPoint,
      schedType: 0 // runonce
    }
    try {
      await sys.board.schedules.setScheduleAsync(data, false);
      sys.board.system.setTZ();
    } catch (err) {
      logger.error(`Error setting schedule ${slsched.scheduleId}.  ${err.message}`);
    }
  }

}
  public static decodeDateTime(systime: SLSystemTimeData) {
  // System Time: {"date":"2022-11-07T16:04:32.000Z","year":2022,"month":11,"dayOfWeek":1,"day":7,"hour":8,"minute":4,"second":32,"millisecond":0,"adjustForDST":true}
  if (sys.general.options.clockSource !== 'server') {
    state.time.year = systime.year;
    state.time.month = systime.month;
    state.time.date = systime.day;
    state.time.hours = systime.hour;
    state.time.minutes = systime.minute;
    state.time.seconds = systime.second;
    sys.general.options.adjustDST = systime.adjustForDST;
    state.emitEquipmentChanges();
  }
}
  /*
  Controller Types
  // Dual Intellitouch
  I10_3D = 5;
  // Intellitouch
  I5 = 0;
  I7_3 = 1;
  I9_3 = 2;
  I5S = 3;
  I9_3S = 4;
  I10X = 6;
  // Not intellitouch...
  SUNTOUCH = 10;
  // EasyTouch
  EASYTOUCH2 = 13; //hwType & 4 = EasyTouchLite
  EASYTOUCH = 14;
  */
  static isEasyTouch(controllerType) {
  return controllerType === 14 || controllerType === 13;
}

  static isIntelliTouch(controllerType) {
  return controllerType !== 14 && controllerType !== 13 && controllerType !== 10;
}

  static isEasyTouchLite(controllerType, hwType) {
  return controllerType === 13 && (hwType & 4) !== 0;
}

  static isDualBody(controllerType) {
  return controllerType === 5;
}
}
export class SLCommands {
  constructor(unit: ScreenLogic.UnitConnection) {
    this._unit = unit;
  }
  protected _unit: ScreenLogic.UnitConnection;
}
export class SLCircuits extends SLCommands {
  public async setCircuitStateAsync(id: number, val: boolean) {
    if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('Circuit or Feature id not valid', id, 'Circuit'));
    let c = sys.circuits.getInterfaceById(id);
    // if (id === 192 || c.type === 3) return await sys.board.circuits.setLightGroupThemeAsync(id - 191, val ? 1 : 0);
    // if (id >= 192) return await sys.board.circuits.setCircuitGroupStateAsync(id, val);
    await this._unit.circuits.setCircuitStateAsync(id, val);
    let cstate = state.circuits.getInterfaceById(id);
    cstate.isOn = val;
    state.emitEquipmentChanges();
    return cstate;
  }
}
export class SLCounter {
  constructor() {
    this.bytesReceived = 0;
    this.bytesSent = 0;
  }
  public bytesReceived: number;
  public bytesSent: number;
  public toLog(): string {
    return `{ "bytesReceived": ${this.bytesReceived}, "bytesSent": ${this.bytesSent} }`;
  }
}

export let sl = new ScreenLogicComms();
