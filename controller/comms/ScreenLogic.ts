import { ControllerType, Timestamp, Utils, utils } from '../../controller/Constants';
import { LightGroup, LightGroupCircuit, sys, Valve, Body, Pump, PumpCircuit, Remote } from '../../controller/Equipment';
import { CircuitState, state, ValveState } from '../../controller/State';
import { RemoteLogin, UnitConnection, FindUnits, SLEquipmentStateData, SLIntellichlorData, SLPumpStatusData, SLScheduleData, SLSystemTimeData, HeatModes, SLControllerConfigData, SLEquipmentConfigurationData, HeaterConfig, Valves, SLChemData, SLGetCustomNamesData } from 'node-screenlogic';
import * as Screenlogic from 'node-screenlogic';
import { EasyTouchBoard } from '../../controller/boards/EasyTouchBoard';
import { IntelliTouchBoard } from '../../controller/boards/IntelliTouchBoard';
import { logger } from '../../logger/Logger';
import { webApp } from '../../web/Server';
import { delayMgr } from '../../controller/Lockouts';
import { config } from '../../config/Config';
import { InvalidEquipmentDataError, InvalidEquipmentIdError, InvalidOperationError } from '../../controller/Errors';
import extend = require('extend');
import { Message } from './messages/Messages';

export class ScreenLogicComms {
  constructor() {
    this._client = new Screenlogic.UnitConnection();
  };
  public a: SLChemData;
  public counter: SLCounter = new SLCounter();
  private _gateway: RemoteLogin;
  private _client: UnitConnection;
  private _pollTimer: NodeJS.Timeout;
  public circuits: SLCircuits;
  public bodies: SLBodies;
  public chlor: SLChlor;
  public schedules: SLSchedule;
  public pumps: SLPump;
  public controller: SLController;
  private _pollCountError: number = 0;
  public isOpen: boolean = false;
  private _cfg: any;
  private _configData: { pumpsReported: number[], intellichemPresent: boolean };
  private pollingInterval = 10000;
  public enabled: boolean = false;

  public eqConfig: any;  // testing purposes

  public async openAsync() {
    let self = this;
    this.circuits = new SLCircuits(this._client);
    this.bodies = new SLBodies(this._client);
    this.chlor = new SLChlor(this._client);
    this.schedules = new SLSchedule(this._client);
    this.pumps = new SLPump(this._client);
    this.controller = new SLController(this._client);
    let cfg = config.getSection('controller.comms');
    if (typeof cfg !== 'undefined') this._cfg = cfg;
    this.enabled = this._cfg.enabled && this._cfg.type === 'screenlogic';
    if (!this._cfg.enabled || this._cfg.type !== 'screenlogic') {
      return;
    }
    let systemName = this._cfg.screenlogic.systemName; // 'Pentair: 00-00-00';
    let password = this._cfg.screenlogic.password.toString(); // '1111';

    this._gateway = new RemoteLogin(systemName);
    this._gateway.on('error', async (err) => {
      logger.error(`Screenlogic Gateway Error: ${err.message}`);
      this.isOpen = false;
      await this._gateway.closeAsync();
      return Promise.resolve(false);
    })
    let unit = await this._gateway.connectAsync();

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
      try {
        this._client.init(systemName, unit.ipAddr, unit.port, password);
        await this._client.connectAsync();
        this._client.removeAllListeners(); // clear out in case we are initializing again
        this._client.on('slLogMessage', (msg) => {
          let _id = Message.nextMessageId;
          msg = { ...msg, _id };
          logger.screenlogic(msg);
        })
        let ver = await this._client.getVersionAsync();
        logger.info(`Screenlogic: connect to ${systemName} ${ver.version} at ${unit.ipAddr}:${unit.port}`);

        let addClient = await this._client.addClientAsync();
        logger.silly(`Screenlogic:Add client result: ${addClient}`);
      } catch (err) {
        throw err;
      }

      state.status = sys.board.valueMaps.controllerStatus.transform(2, 12);
      state.emitControllerChange();
      try {
        let equipConfig = await this._client.equipment.getEquipmentConfigurationAsync();
        logger.silly(`Screenlogic: Equipment config: ${JSON.stringify(equipConfig, null, 2)}`);
        await Controller.decodeEquipmentAsync(equipConfig);
      } catch (err) {
        logger.error(`Screenlogic: Error getting equipment configuration. ${err.message}`);
      }

      state.status = sys.board.valueMaps.controllerStatus.transform(2, 24);
      state.emitControllerChange();
      try {

        let customNames = await this._client.equipment.getCustomNamesAsync();
        logger.silly(`Screenlogic: custom names ${customNames}`);
        await Controller.decodeCustomNames(customNames);
      } catch (err) {
        logger.error(`Screenlogic: Error getting custom names. ${err.message}`);
      }

      state.status = sys.board.valueMaps.controllerStatus.transform(2, 36);
      state.emitControllerChange();
      try {
        let controller = await this._client.equipment.getControllerConfigAsync();
        logger.silly(`Screenlogic:Controller: ${JSON.stringify(controller, null, 2)}`);
        this._configData = await Controller.decodeController(controller);
      } catch (err) {
        logger.error(`Screenlogic: Error getting controller configuration. ${err.message}`);
      }

      state.status = sys.board.valueMaps.controllerStatus.transform(2, 48);
      state.emitControllerChange();
      try {
        let systemTime = await this._client.equipment.getSystemTimeAsync();
        // logger.silly(`Screenlogic:System Time: ${JSON.stringify(systemTime)}`)
        Controller.decodeDateTime(systemTime);
      } catch (err) {
        logger.error(`Screenlogic: Error getting system time. ${err.message}`);
      }

      // PUMPS 
      state.status = sys.board.valueMaps.controllerStatus.transform(2, 60);
      state.emitControllerChange();
      this._configData.pumpsReported.forEach(async pumpNum => {
        try {
          let pumpStatus = await this._client.pump.getPumpStatusAsync(pumpNum);
          logger.silly(`Screenlogic:Pump ${pumpNum}: ${JSON.stringify(pumpStatus)}`);
          await Controller.decodePumpStatusAsync(pumpNum, pumpStatus);
        } catch (err) {
          logger.error(`Screenlogic: Error getting pump configuration. ${err.message}`);
        }
      })

      state.status = sys.board.valueMaps.controllerStatus.transform(2, 72);
      state.emitControllerChange();
      try {
        let recurringSched = await this._client.schedule.getScheduleDataAsync(0);
        logger.silly(`Screenlogic:reccuring schedules: ${JSON.stringify(recurringSched)}`);
        let runOnceSched = await this._client.schedule.getScheduleDataAsync(1);
        logger.silly(`Screenlogic:Run once schedules: ${JSON.stringify(runOnceSched)}`);
        await Controller.decodeSchedules(recurringSched, runOnceSched);
      } catch (err) {
        logger.error(`Screenlogic: Error getting schedules. ${err.message}`);
      }

      state.status = sys.board.valueMaps.controllerStatus.transform(2, 84);
      state.emitControllerChange();
      try {
        let intellichlor = await this._client.chlor.getIntellichlorConfigAsync();
        // logger.silly(`Screenlogic:Intellichlor: ${JSON.stringify(intellichlor)}`);
        await Controller.decodeIntellichlorAsync(intellichlor);
      } catch (err) {
        logger.error(`Screenlogic: Error getting Intellichlor. ${err.message}`);
      }

      state.status = sys.board.valueMaps.controllerStatus.transform(2, 95);
      state.emitControllerChange();
      try {
        if (this._configData.intellichemPresent) {
          let chem = await this._client.chem.getChemicalDataAsync();
          logger.silly(`Screenlogic:Chem data: ${JSON.stringify(chem)}`);
          await Controller.decodeChemController(chem);
        }
      } catch (err) {
        logger.error(`Screenlogic: Error getting Intellichem. ${err.message}`);
      }

      state.status = sys.board.valueMaps.controllerStatus.transform(2, 98);
      state.emitControllerChange();
      try {
        let equipmentState = await this._client.equipment.getEquipmentStateAsync();
        logger.silly(`Screenlogic: equipment state: ${JSON.stringify(equipmentState)}`);
        await Controller.decodeEquipmentState(equipmentState);
      } catch (err) {
        logger.error(`Screenlogic: Error getting equipment state. ${err.message}`);
      }
      sys.board.circuits.syncVirtualCircuitStates()
      state.status = sys.board.valueMaps.controllerStatus.transform(1, 100);
      state.emitControllerChange();

      this._client.on('equipmentState', async function (data) { await Controller.decodeEquipmentState(data); })
      this._client.on('intellichlorConfig', async function (data) {
        await Controller.decodeIntellichlorAsync(data);
      });
      this._client.on('equipmentConfig', async function (data) {
        await Controller.decodeController(data);
      });
      this._client.on('chemicalData', async function (data) {
        await Controller.decodeChemController(data);

      });
      this._client.on('getSystemTime', async function (data) {
        Controller.decodeDateTime(data);
      });
      // client.on('getScheduleData', async function(){
      // await Controller.decodeSchedules(recurringSched, runOnceSched);});  // how do we know if this is recurring or runonce?  Investigate.
      this._client.on('cancelDelay', async function (data) {
        logger.silly(`Screenlogic:cancelDelay: ${data}`)
      }) // not programmed yet});
      this._client.on('equipmentConfiguration', async function (data) {
        logger.silly(`Screenlogic:equipConfig ${JSON.stringify(data)}`)
      })// which one?});
      this._client.on('getPumpStatus', async function (data) {
        logger.silly(`Screenlogic:getPumpStatus: ${JSON.stringify(data)}`);
        // await Controller.decodePump(1, pumpStatus);
      });  // how do we know which pump id?  Investigate.
      this._client.on('weatherForecast', async function (data) {
        logger.silly(`Screenlogic:weatherforecast: ${JSON.stringify(data)}`)
      });
      this._client.on('circuitStateChanged', async function (data) {
        logger.silly(`Screenlogic:circuitstatechanged: ${JSON.stringify(data)}`)
      });
      this._client.on('setPointChanged', async function (data) {
        logger.silly(`Screenlogic:setpointchanged: ${JSON.stringify(data)}`)
      });

      // not working

      this._client.on('heatModeChanged', async function (data) {
        logger.silly(`Screenlogic:heat mode changed: ${JSON.stringify(data)}`);
      });
      this._client.on('intellibriteDelay', async function (data) {
        logger.silly(`Screenlogic:intellibrite delay: ${JSON.stringify(data)}`)
      });
      this._client.on('weatherForecastChanged', async function () {
        logger.silly(`Screenlogic:weather forecast changed}`);
        // found - no data returned; need to request data
      });
      // No data comes through... maybe need to request weather data again?
      this._client.on('scheduleChanged', async function (data) {
        logger.silly(`Screenlogic:schedule changed: ${JSON.stringify(data)}`);
        let recurringSched = await self._client.schedule.getScheduleDataAsync(0);
        logger.silly(`Screenlogic:reccuring schedules: ${JSON.stringify(recurringSched)}`);

        let runOnceSched = await self._client.schedule.getScheduleDataAsync(1);
        logger.silly(`Screenlogic:Run once schedules: ${JSON.stringify(runOnceSched)}`);
        await Controller.decodeSchedules(recurringSched, runOnceSched);
      });
      this._client.on('setCircuitRuntimebyId', async (data) => {
        logger.silly(`Screenlogic:Set Circuit By Runtime event ${data}`);
        await self._client.equipment.getControllerConfigAsync();
      });
      // this._client.on('error', async (e) => {
      //   // if the error event from the net.socket isn't caught, it sometimes crashes the app.
      //   logger.error(`Screenlogic error (net.socket): ${e.message}`);
      //   if (e.code === 'ECONNRESET') {
      //     try {
      //       logger.info(`Screenlogic net.socket timeout.  Restarting.`)
      //       await self.stopAsync();
      //       await self.initAsync();
      //     }
      //     catch (err) {
      //       logger.error(`Error trying to reset Screenlogic comms. ${err.message}`);
      //     };
      //   }
      // })
      // this._client.on('clientError', (e) => {
      //   // if the error event from the net.socket isn't caught, it sometimes crashes the app.
      //   logger.error(`Screenlogic client error (net.socket): ${e.message}`);
      // })
      this._client.on('loginFailed', (data) => {
        logger.error(`Screenlogic login failed.  Invalid password.`);
        this.isOpen = false;
      })
      this._client.on('bytesRead', (bytes) => {
        logger.silly(`Screenlogic:SL Bytes Read: ${bytes}`);
        this.counter.bytesReceived += bytes;
        this.emitScreenlogicStats();
      });
      this._client.on('bytesWritten', (bytes) => {
        logger.silly(`Screenlogic:SL Bytes written: ${bytes}`);
        this.counter.bytesSent += bytes;
        this.emitScreenlogicStats();
      });
      this.pollAsync();
      // logger.silly(`Screenlogic:Equipment State: ${JSON.stringify(equipmentState, null, 2)}`);
      /* // EQUIPMENT
      
      

      let weatherForecast = await client.equipment.getWeatherForecast();
      logger.silly(`Screenlogic:Weather: ${JSON.stringify(weatherForecast)}`); 

      let hist = await screenlogic.equipment.getHistoryData()
      logger.silly(`Screenlogic:history data: ${JSON.stringify(hist)}`)
    
      
      // CHEM
      let chemHist = await screenlogic.chem.getChemHistoryData()
      logger.silly(`Screenlogic:history data: ${JSON.stringify(chemHist)}`)
    


   */
      // setTimeout(async () => {
      //   logger.silly(`Screenlogic:closing connection after 60s`);
      //   await client.closeAsync();
      // }, 120 * 1000)
      // let close = await client.closeAsync();
      // logger.silly(`Screenlogic:client closed: ${close}`);
    } catch (error) {
      logger.error(`Screenlogic error: ${error.message}`);
      await this._client.closeAsync();
      return Promise.resolve(error);
    }
  }
  public async closeAsync() {
    await this._client.closeAsync();
    this._client.removeAllListeners();
    this.isOpen = false;
    this.enabled = false;
    if (typeof this._pollTimer !== 'undefined') clearTimeout(this._pollTimer);
    this._pollTimer = null;
  }
  /* public async setScreenlogicAsync(data) {
    let enabled = typeof data.enabled !== 'undefined' ? utils.makeBool(data.enabled) : false;
    let systemName = typeof data.systemName !== 'undefined' ? data.systemName : this._cfg.systemName;
    let password = typeof data.password !== 'undefined' ? data.password.toString() : this._cfg.password;
    let regx = /Pentair: (?:(?:\d|[A-Z])(?:\d|[A-Z])-){2}(?:\d|[A-Z])(?:\d|[A-Z])/g;
    let type = typeof data.connectionType !== 'undefined' ? data.connectionType : this._cfg.connectionType;
    if (type !== 'remote' && type !== 'local') return Promise.reject(new InvalidEquipmentDataError(`An invalid type was supplied for Screenlogic ${type}.  Must be remote or local.`, 'Screenlogic', data));
    if (systemName.match(regx) === null) return Promise.reject(new InvalidEquipmentDataError(`An invalid system name was supplied for Screenlogic ${systemName}}.  Must be in the format 'Pentair: xx-xx-xx'.`, 'Screenlogic', data));
    if (password.length > 4) return Promise.reject(new InvalidEquipmentDataError(`An invalid password was supplied for Screenlogic ${password}. (Length must be <= 4)}`, 'Screenlogic', data));
    this.enabled = enabled;
    if (this._cfg.enabled && !enabled || this._cfg.systemName !== systemName || this._cfg.password !== password || this._cfg.cype !== type) {
      await this.closeAsync();
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
      let error = await this.openAsync();
      if (typeof error !== 'undefined') return Promise.reject(error);
    }

  } */
  public async pollAsync() {
    let self = this;
    try {
      if (typeof this._pollTimer !== 'undefined' || this._pollTimer) clearTimeout(this._pollTimer);
      this._pollTimer = null;
      if (!this.isOpen) { return; };


      /*
      // Uncomment this block to do a comparison of the 'getConfig' packets.
      // RSG used this to recreate the setConfig packet arrays
      let equipConfig = await this._client.equipment.getEquipmentConfigurationAsync();
      logger.silly(`Screenlogic: Equipment config: ${JSON.stringify(equipConfig, null, 2)}`);

      if (typeof this.eqConfig === 'undefined') this.eqConfig = equipConfig;
      // let's compare so we can find differences easily
      for (const [key, value] of Object.entries(this.eqConfig.rawData)) {
        console.log(key);
        for (let i = 0; i < this.eqConfig.rawData[key].length; i++) {
          if (this.eqConfig.rawData[key][i] !== equipConfig.rawData[key][i]) {
            console.log(`Difference at ${key}[${i}].  prev: ${this.eqConfig.rawData[key][i]} (${utils.dec2bin(this.eqConfig.rawData[key][i])})-> new: ${equipConfig.rawData[key][i]} (${utils.dec2bin(equipConfig.rawData[key][i])})`)
          }
        }
      }

      this.eqConfig = equipConfig;
      */

      let pumps = sys.pumps.get();
      let numPumps = pumps.length;
      for (let i = 1; i < numPumps + 1; i++) {
        if (pumps[i - 1].id === 10) continue; // skip dual speed
        let pumpStatus = await self._client.pump.getPumpStatusAsync(i);
        logger.silly(`Screenlogic:Pump ${i}: ${JSON.stringify(pumpStatus)}`);
        await Controller.decodePumpStatusAsync(i, pumpStatus);
      }
      sys.board.heaters.syncHeaterStates();
      sys.board.schedules.syncScheduleStates();
      sys.board.circuits.syncVirtualCircuitStates();
    }
    catch (err) {
      logger.error(`Error polling screenlogic (${this._pollCountError} errors)- ${err}`); this._pollCountError++;
      /* if (this._pollCountError > 3) {
        await this.initAsync();
      } */
    }
    finally { this._pollTimer = setTimeout(async () => await self.pollAsync(), this.pollingInterval || 10000); }
  }
  public static async searchAsync() {
    try {
      let finder = new FindUnits();
      let localUnits = await finder.searchAsync();
      finder.close();
      return Promise.resolve(localUnits);
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
  public toLog(msg): string {
    return `{"systemName":"${msg.systemName}","dir":"${msg.dir}","protocol":"${msg.protocol}", "_id": ${msg._id}, "action": ${msg.action}, "payload":[${JSON.stringify(msg.payload)}],"ts":"${Timestamp.toISOLocal(new Date())}"}`;
  }
}

class Controller {
  public static async decodeController(config: SLControllerConfigData) {
    sys.general.options.units = state.temps.units = config.degC ? sys.board.valueMaps.tempUnits.getValue('C') : sys.board.valueMaps.tempUnits.getValue('F');
    let lightGroup: any = { circuits: [] };
    let lgCircId = 1;
    for (let i = 0; i < config.circuitArray.length; i++) {
      let _circ = config.circuitArray[i];
      let circuit = sys.circuits.getInterfaceById(_circ.circuitId);
      let data: any = {
        id: _circ.circuitId,
        type: _circ.function,
        nameId: _circ.nameIndex,
        freeze: _circ.freeze,
        eggTimer: _circ.eggTimer,
        // 0 = pool; 1 = spa; 2 = features; 4 = lights; 5 = hide
        showInFeatures: typeof circuit.showInFeatures !== 'undefined' ? circuit.showInFeatures : _circ.function === 16 ? true : _circ.interface !== 4 && _circ.interface !== 5,

      }
      // errr.... something is wrong.  Why do I have circuit function = 5 here?
      // why does it look like function/interface are reversed??
      /*
          {
      "circuitId": 4,
      "name": "Pool Light",
      "nameIndex": 63,
      "function": 2,
      "interface": 16,
      "freeze": 0,
      "colorSet": 2,
      "colorPos": 0,
      "colorStagger": 20,
      "deviceId": 4,
      "eggTimer": 720
    },
      */

      /*
      SL Circuits
     POOLCIRCUIT_CLEANER = 5;
     POOLCIRCUIT_CLEANER_SECOND = 6;
     POOLCIRCUIT_COLOR_WHEEL = 12;
     POOLCIRCUIT_DIMMER = 8;
     POOLCIRCUIT_DIMMER_25 = 18;
     POOLCIRCUIT_FLOORCLEANER = 15;
     POOLCIRCUIT_GENERIC = 0;
     POOLCIRCUIT_INTELLIBRITE = 16;
     POOLCIRCUIT_LAST_ID = 19;
     POOLCIRCUIT_LIGHT = 7;
     POOLCIRCUIT_MAGICSTREAM = 17;
     POOLCIRCUIT_PHOTON = 11;
     POOLCIRCUIT_POOL = 2;
     POOLCIRCUIT_POOL_SECOND = 4;
     POOLCIRCUIT_SAL = 10;
     POOLCIRCUIT_SAM = 9;
     POOLCIRCUIT_SPA = 1;
     POOLCIRCUIT_SPA_SECOND = 3;
     POOLCIRCUIT_SPILLWAY = 14;
     POOLCIRCUIT_UNUSED = 19;
     POOLCIRCUIT_VALVE = 13;
      */
      if (_circ.function === 16) {
        let lgCirc = {
          color: _circ.colorSet,
          swimDelay: _circ.colorStagger,
          position: _circ.colorPos,
          circuit: _circ.circuitId,
          ...data,
          id: lgCircId,
        }
        lgCircId++;
        lightGroup.circuits.push(lgCirc);
      }
      await sys.board.circuits.setCircuitAsync(data, false);
    }
    if (lightGroup.circuits.length === 0) {
      sys.lightGroups.removeItemById(192);
      state.lightGroups.removeItemById(192);
    }
    else {
      let grp = sys.lightGroups.getItemById(192);
      lightGroup.name = typeof grp.name === 'undefined' ? 'Intellibrite' : grp.name;
      lightGroup.id === grp.isActive ? grp.id : undefined;
      await sys.board.circuits.setLightGroupAsync(lightGroup, false);
      let sgroup = state.lightGroups.getItemById(192, true);
      sgroup.isActive = true;
      sgroup.name = lightGroup.name;
      sgroup.type = 3;
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
    let pumpsReported: number[] = [];
    if (config.equipment.POOL_IFLOWPRESENT0) {
      pumpsReported.push(1);
    }
    else {
      sys.pumps.removeItemById(1);
      state.pumps.removeItemById(1);
    };
    if (config.equipment.POOL_IFLOWPRESENT1) {
      pumpsReported.push(2);
    }
    else {
      sys.pumps.removeItemById(2);
      state.pumps.removeItemById(2);
    };
    if (config.equipment.POOL_IFLOWPRESENT2) {
      pumpsReported.push(3);
    }
    else {
      sys.pumps.removeItemById(3);
      state.pumps.removeItemById(3);
    };
    if (config.equipment.POOL_IFLOWPRESENT3) {
      pumpsReported.push(4);
    }
    else {
      sys.pumps.removeItemById(4);
      state.pumps.removeItemById(4);
    };
    if (config.equipment.POOL_IFLOWPRESENT4) {
      pumpsReported.push(5);
    }
    else {
      sys.pumps.removeItemById(5);
      state.pumps.removeItemById(5);
    };
    if (config.equipment.POOL_IFLOWPRESENT5) {
      pumpsReported.push(6);
    }
    else {
      sys.pumps.removeItemById(6);
      state.pumps.removeItemById(6);
    };
    if (config.equipment.POOL_IFLOWPRESENT6) {
      pumpsReported.push(7);
    }
    else {
      sys.pumps.removeItemById(7);
      state.pumps.removeItemById(7);
    };
    if (config.equipment.POOL_IFLOWPRESENT7) {
      pumpsReported.push(8);
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
    */
    let intellichemPresent: boolean = false;
    if (config.equipment.POOL_ICHEMPRESENT) {
      intellichemPresent = true;
    };
    return { pumpsReported, intellichemPresent };
  }
  public static async decodeEquipmentState(eqstate: SLEquipmentStateData) {
    /*
  {
    panelMode: 0,
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
              return this.m_panelMode == 1;
          }
      
          public boolean isDeviceSync() {
              return this.m_panelMode == 2;
          }
      
          public boolean isDeviceServiceMode() {
              return this.m_panelMode == 3;
          } */
      if (eqstate.panelMode === 1) {
        state.mode = 0; // ready
        state.status = sys.board.valueMaps.controllerStatus.transform(1);
      }
      else if (eqstate.panelMode === 2) {
        // syncronizing... 
        state.mode = 0;
        state.status = sys.board.valueMaps.controllerStatus.transform(2);
      }
      else if (eqstate.panelMode === 3) {
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
        let body = sys.bodies.getItemById(i + 1);
        body.setPoint = tbody.setPoint = slbody.setPoint;
        body.heatMode = tbody.heatMode = slbody.heatMode === 3 ? 1 : slbody.heatMode;  // 0=off; 3=heater
        tbody.heatStatus = slbody.heatStatus === 2 ? 1 : slbody.heatStatus;  // 2=heater active
        tbody.coolSetpoint = slbody.coolSetPoint;
        tbody.temp = slbody.currentTemp;
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
      let address = 144;
      let chem = sys.chemControllers.getItemByAddress(address);
      if (chem.isActive) {
        let schem = state.chemControllers.getItemById(chem.id, true);
        /* pH: 0, 
        orp: 0,
        saturation: 0,
        saltPPM: 0,
        pHTank: 0,
        orpTank: 0,
        alarms: 0 */
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
    } catch (err) {
      logger.error(`Caught error in decodeEquipmentState: ${err.message}`);
    }
  }
  public static async decodeCustomNames(customNames: SLGetCustomNamesData) {
    for (let i = 0; i < sys.equipment.maxCustomNames; i++) {
      let data = {
        id: i,
        name: customNames.names[i]
      }
      try {

        await sys.board.system.setCustomNameAsync(data, false)
      }
      catch (err) {
        logger.error(`Error setting custom name ${JSON.stringify(data)}`);
      };
    }
  }
  public static async decodeEquipmentAsync(equip: SLEquipmentConfigurationData) {
    if (sys.controllerType !== ControllerType.EasyTouch && Controller.isEasyTouch(equip.controllerType)) {
      sys.controllerType = ControllerType.EasyTouch;
      (sys.board as EasyTouchBoard).initExpansionModules(equip.controllerType, equip.hardwareType);
    }
    else if (sys.controllerType !== ControllerType.IntelliTouch && Controller.isIntelliTouch(equip.controllerType)) {
      sys.controllerType = ControllerType.IntelliTouch;
      (sys.board as IntelliTouchBoard).initExpansionModules(equip.controllerType, equip.hardwareType);
    }

    let body = sys.bodies.getItemById(2);
    sys.general.options.manualHeat = body.manualHeat = equip.misc.manualHeat;

    await Controller.decodeHeatersAsync(equip.heaterConfig);
    await Controller.decodeValvesAsync(equip.valves);
    Controller.decodeHighSpeed(equip.highSpeedCircuits);
    // delays
    sys.general.options.pumpDelay = equip.delays.pumpOffDuringValveAction;
    for (let i = 0; i < sys.bodies.length; i++) {
      let bs = state.temps.bodies.getItemById(i + 1);
      if (bs.circuit === 1) bs.heaterCooldownDelay = equip.delays.spaPumpOnDuringHeaterCooldown;
      else if (bs.circuit === 6) bs.heaterCooldownDelay = equip.delays.poolPumpOnDuringHeaterCooldown;
    }

    Controller.decodeRemote(equip.remotes);
    Controller.decodePumpAsync(equip.pumps);
    // lights
    // packet only lists all-on all-off for intellibrite.

    // if (equip.misc.intelliChem) {
    //   let chem = sys.chemControllers.getItemByAddress(144, true);
    //   let schem = state.chemControllers.getItemById(1, true);
    //   schem.isActive = chem.isActive = true;
    // }
    // else {
    //   sys.chemControllers.removeItemById(1);
    //   state.chemControllers.removeItemById(1);
    // }
    sys.equipment.controllerFirmware = `${Math.floor(equip.version / 1000).toString()}.${(equip.version % 1000).toString()}`;
  }
  public static async decodeHeatersAsync(heaterConfig: HeaterConfig) {
    let address: number;
    let id: number;
    let type: number = 1;
    let cooling: boolean = false;
    let body: number = 32;
    // how do we know the heater is a hybrid (type=4)??
    // if no hybrid, we do have a gas heater;  
    // it may not be possible to set a Hybrid heater from SL... 
    // will go with that until we learn otherwise 
    // also todo - how to add heaters to dual bodies?
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
    // RSG - Which type is this?  Duplicate of 3 above.
    // else if (heaterConfig.solarHeatPumpPresent) {
    //   let heater = sys.heaters.getItemById(3);
    //   if (!heater.isActive) {
    //     data.type = 3;
    //     add = true;
    //   }
    //batt}
    // Need to figure out dual body here: body2SolarPresent
    if (add) {
      sys.board.heaters.setHeaterAsync(data, false).catch((err) => {
        logger.error(`Error setting additional heaters: ${err.message}`)
      });
    }
    if (typeof heaterConfig.units !== 'undefined') state.temps.units = sys.general.options.units = heaterConfig.units;  // 0 = F, 1 = C
  }
  public static async decodeValvesAsync(valves: Valves[]) {
    for (let i = 0; i < valves.length; i++) {
      let _valve = valves[i];
      let data: any = {
        id: _valve.valveIndex,
        name: _valve.valveName,
        circuit: _valve.deviceId,
      }
      await sys.board.valves.setValveAsync(data, false);
    }
    /*     "valves": [
          {
            "loadCenterIndex": 0,
            "valveIndex": 1,
            "valveName": "A",
            "loadCenterName": "1",
            "deviceId": 0
          },
          {
            "loadCenterIndex": 0,
            "valveIndex": 2,
            "valveName": "B",
            "loadCenterName": "1",
            "deviceId": 0
          }
        ], */
  }
  public static decodeHighSpeed(highSpeed: number[]) {
    let maxCircuits = sys.controllerType === ControllerType.IntelliTouch ? 8 : 4;
    let arrCircuits = [];
    let pump = sys.pumps.find(x => { return x.master !== 1 && x.type === 65 });
    for (let i = 0; i < maxCircuits && i < highSpeed.length; i++) {
      let val = highSpeed[i];
      if (val > 0) arrCircuits.push(val);
      else if (typeof pump !== 'undefined') pump.circuits.removeItemById(i);
    }
    if (arrCircuits.length > 0) {
      let pump = sys.pumps.getDualSpeed(true);
      for (let j = 1; j <= arrCircuits.length; j++) pump.circuits.getItemById(j, true).circuit = arrCircuits[j - 1];
    }
    else if (typeof pump !== 'undefined') sys.pumps.removeItemById(pump.id);
  }
  public static decodeRemote(remoteDataArray) {
    if (sys.controllerType === ControllerType.EasyTouch) {

      let remote: Remote = sys.remotes.getItemById(5, true);
      let bActive = false;
      for (let i = 0; i < 10; i++) {
        remote["button" + i] = remoteDataArray.fourButton[i];
        bActive = bActive || remote["button" + i] > 0;
      }
      remote.isActive = bActive;
      remote.type = 1;
      remote.name = "is4";

      remote = sys.remotes.getItemById(1, true);
      bActive = false;
      for (let i = 0; i < 10; i++) {
        remote["button" + i] = remoteDataArray.tenButton[0][i];
        bActive = bActive || remote["button" + i] > 0;
      }
      remote.isActive = bActive;
      remote.type = 2;
      remote.name = "is10";
    }
    else if (sys.controllerType === ControllerType.IntelliTouch) {
      // Intellitouch
      // 10 button #1

      for (let r = 0; r < 4; r++) {
        let remote: Remote = sys.remotes.getItemById(r + 1, true);
        let bActive = false;
        for (let i = 0; i < 10; i++) {
          remote["button" + (i + 1)] = remoteDataArray.tenButton[r][i];
          bActive = bActive || remote["button" + (i + 1)] > 0;
        }
        remote.isActive = bActive;
        remote.type = 2;
        remote.name = "is10";
        if (r === 3) {
          let remote5 = sys.remotes.getItemById(5);
          let remote6 = sys.remotes.getItemById(6);
          remote5.name = remote6.name = "is4";
          remote5.type = remote6.type = 1;
          if (!remote.button5 && !remote.button10) {
            remote.isActive = false;
            remote5.button1 = remote.button1;
            remote5.button2 = remote.button2;
            remote5.button3 = remote.button3;
            remote5.button4 = remote.button4;
            remote6.button1 = remote.button6;
            remote6.button2 = remote.button7;
            remote6.button3 = remote.button8;
            remote6.button4 = remote.button9;
            if (!remote5.button1 && !remote5.button2 && !remote5.button3 && !remote5.button4) remote5.isActive = false;
            else remote5.isActive = true;

            if (!remote6.button1 && !remote6.button2 && !remote6.button3 && !remote6.button4) remote6.isActive = false;
            else remote6.isActive = true;

          }
          else {
            remote5.isActive = remote6.isActive = false;
          }
        }
      }
    }

    let remote = sys.remotes.getItemById(7, true);
    remote.button1 = remoteDataArray.quickTouch[0];
    remote.button2 = remoteDataArray.quickTouch[1];
    remote.button3 = remoteDataArray.quickTouch[2];
    remote.button4 = remoteDataArray.quickTouch[3];

    if (!remote.button1 && !remote.button2 && !remote.button3 && !remote.button4) remote.isActive = false;
    else remote.isActive = true;
    remote.name = "QuickTouch";
  }
  public static async decodeIntellichlorAsync(slchlor: SLIntellichlorData) {
    // Intellichlor: {"installed":false,"status":1,"poolSetPoint":12,"spaSetPoint":0,"salt":0,"flags":0,"superChlorTimer":0}
    let chlor = sys.chlorinators.getItemById(1);
    if (slchlor.installed) {
      let data: any = {
        id: chlor.isActive ? chlor.id : 0,
        superChlorHours: slchlor.superChlorTimer,
        poolSetpoint: slchlor.poolSetPoint,
        spaSetpoint: slchlor.spaSetPoint,
        model: chlor.model || 0,
        body: 32
      }
      await sys.board.chlorinator.setChlorAsync(data, false);
      let chlorState = state.chlorinators.getItemById(1, true);
      chlorState.saltLevel = slchlor.salt;
      chlorState.poolSetpoint = slchlor.poolSetPoint;
      chlorState.spaSetpoint = slchlor.spaSetPoint;
      state.emitEquipmentChanges();
    }
    else {
      sys.chlorinators.removeItemById(1);
      state.chlorinators.removeItemById(1);
    };

  }
  public static async decodeChemController(slchem: SLChemData) {
    // Chem data: {"isValid":true,"pH":0,"orp":0,"pHSetPoint":0,"orpSetPoint":0,"pHTankLevel":0,"orpTankLevel":0,"saturation":0,"calcium":0,"cyanuricAcid":0,"alkalinity":0,"saltPPM":0,"temperature":0,"balance":0,"corrosive":false,"scaling":false,"error":false}
    let chem = sys.chemControllers.getItemByAddress(144);
    let data: any = {
      id: chem.isActive ? chem.id : undefined,
      address: 144,
      calciumHardness: slchem.calcium,
      cyanuricAcid: slchem.cyanuricAcid,
      alkalinity: slchem.alkalinity,
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
    try {

      await sys.board.chemControllers.setChemControllerAsync(data, false);
      let schem = state.chemControllers.getItemById(1);
      schem.ph.level = slchem.pH;
      schem.orp.level = slchem.orp;
      schem.saturationIndex = slchem.saturation;
      schem.alarms.bodyFault = slchem.error ? 1 : 0; // maybe a better place to assign the error? 
      state.emitEquipmentChanges();
    }
    catch (err) {
      return Promise.reject(err);
    }

  }
  public static async decodePumpAsync(pDataArr: any) {
    pDataArr.forEach(async (pData, idx) => {
      await sys.board.pumps.setPumpAsync(pData, false);
    })
  }
  public static async decodePumpStatusAsync(id: number, slpump: SLPumpStatusData) {
    /*   {
        pumpCircuits: [
          { circuitId: 6,speed: 2000,isRPMs: true, },
          { circuitId: 8, speed:2700,isRPMs: true, },
          { circuitId: 2,speed: 2710,isRPMs: true, },
          { circuitId: 2,speed:1000, isRPMs: true,},
          { circuitId: 5,speed:2830, isRPMs: true,},
          { circuitId: 0,speed: 30,isRPMs: false,},
          { circuitId: 0,speed: 30,isRPMs: false,},
          { circuitId: 0,speed: 30,isRPMs: false,},
        ],
        pumpType: 4,
        isRunning: false,
        pumpWatts: 0,
        pumpRPMs: 0,
        pumpUnknown1: 0,
        pumpGPMs: 0,
        pumpUnknown2: 255,
      }
    */
    // RKS: 05-07-23 - This process of getting the pump by its id is flawed.  We need to pull this information by its address.
    //let pstate = state.pumps.getItemById(id);
    let pstate = state.pumps.find(x => x.address === 95 + id);
    if (typeof pstate !== 'undefined') {
      pstate.watts = slpump.pumpWatts;
      pstate.rpm = slpump.pumpRPMs;
      pstate.flow = slpump.pumpGPMs === 255 ? 0 : slpump.pumpGPMs;
      pstate.command = (pstate.rpm > 0 || pstate.watts > 0) ? 10 : 0;
      state.emitEquipmentChanges();
    }
  }
  public static async decodeSchedules(slrecurring: SLScheduleData, slrunonce: SLScheduleData) {
    /*     reccuring schedules: [{"scheduleId":1,"circuitId":6,"startTime":"1800","stopTime":"0700","dayMask":127,"flags":0,"heatCmd":4,"heatSetPoint":70,"days":["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]},
    
    {"scheduleId":4,"circuitId":2,"startTime":"1800","stopTime":"2300","dayMask":127,"flags":0,"heatCmd":0,"heatSetPoint":0,"days":["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]},{"scheduleId":11,"circuitId":6,"startTime":"0800","stopTime":"1700","dayMask":127,"flags":0,"heatCmd":4,"heatSetPoint":70,"days":["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]}]
    
        Run once schedules: [{"scheduleId":12,"circuitId":6,"startTime":"0800","stopTime":"1100","dayMask":1,"flags":1,"heatCmd":4,"heatSetPoint":70,"days":["Mon"]},{"scheduleId":13,"circuitId":6,"startTime":"0800","stopTime":"1100","dayMask":1,"flags":1,"heatCmd":4,"heatSetPoint":70,"days":["Mon"]}] */

    for (let i = 0; i < slrecurring.data.length; i++) {
      let slsched = slrecurring.data[i];
      try {
        let data = {
        circuit: slsched.circuitId,
          startTime: Math.floor(parseInt(slsched.startTime, 10) / 100) * 60 + parseInt(slsched.startTime, 10) % 100,
          endTime: Math.floor(parseInt(slsched.stopTime, 10) / 100) * 60 + parseInt(slsched.stopTime, 10) % 100,
          scheduleDays: slsched.dayMask,
          changeHeatSetPoint: slsched.heatCmd > 0,
          heatSetPoint: slsched.heatSetPoint,
          schedType: 128 // recurring
        }
        await sys.board.schedules.setScheduleAsync(data, false)
      } catch (err) {
        logger.error(`Error setting schedule ${slsched.scheduleId}.  ${err.message}`);
      }
    }
    for (let i = 0; i < slrunonce.data.length; i++) {
      let slsched = slrunonce.data[i];
      try {
        let data = {
          id: slsched.scheduleId,
          circuit: slsched.circuitId,
          // start and stop come in as military time string
          startTime: parseInt(slsched.startTime, 10),
          endTime: parseInt(slsched.stopTime, 10),
          scheduleDays: slsched.dayMask,
          changeHeatSetPoint: slsched.heatCmd > 0,
          heatSetPoint: slsched.heatSetPoint,
          schedType: 0 // runonce
        }
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
  constructor(unit: UnitConnection) {
    this._unit = unit;
  }
  protected _unit: UnitConnection;
}
export class SLCircuits extends SLCommands {
  public async setCircuitAsync(circuitId: number, nameIndex: number, circuitFunction: number, circuitInterface: number, freeze: boolean = false, colorPos: number = 0) {
    try {

      let lg: LightGroup = sys.lightGroups.getItemById(1);
      for (let i = 0; i < lg.circuits.length; i++) {
        let cg: LightGroupCircuit = lg.circuits[i];
        if (cg.circuit === circuitId) colorPos = cg.position;
      }
      await this._unit.circuits.setCircuitAsync(circuitId, nameIndex, circuitFunction, circuitInterface, freeze, colorPos);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  public async setCircuitStateAsync(id: number, val: boolean) {
    try {
      if (isNaN(id)) return Promise.reject(new InvalidEquipmentIdError('Circuit or Feature id not valid', id, 'Circuit'));
      let c = sys.circuits.getInterfaceById(id);
      // if (id === 192 || c.type === 3) return await sys.board.circuits.setLightGroupThemeAsync(id - 191, val ? 1 : 0);
      // if (id >= 192) return await sys.board.circuits.setCircuitGroupStateAsync(id, val);
      await this._unit.circuits.setCircuitStateAsync(id, val);
      // let cstate = state.circuits.getInterfaceById(id);
      // cstate.isOn = val;
      // state.emitEquipmentChanges();
      // return cstate;
    } catch (err) {
      return Promise.reject(err);
    }
  }

  public async setLightGroupThemeAsync(lightTheme: number) {
    try {
      // SL Light Themes
      const ALLOFF = 0;
      const ALLON = 1;
      const SET = 2;
      const SYNC = 3;
      const SWIM = 4;
      const PARTY = 5;
      const ROMANCE = 6;
      const CARIBBEAN = 7;
      const AMERICAN = 8;
      const SUNSET = 9;
      const ROYALTY = 10;
      const SAVE = 11;
      const RECALL = 12;
      const BLUE = 13;
      const GREEN = 14;
      const RED = 15;
      const WHITE = 16;
      const MAGENTA = 17;
      const MS_THUMPER = 18;
      const MS_NEXT_MODE = 19;
      const MS_RESET = 20;
      const MS_HOLD = 21;

      // Convert njsPC to SL themes
      switch (lightTheme) {
        //       [0, { name: 'off', desc: 'Off' }],
        //       [1, { name: 'on', desc: 'On' }],
        case 0:
        case 1:
          break;
        // [128, { name: 'colorsync', desc: 'Color Sync' }],
        case 128:
          lightTheme = SYNC;
          break;
        // [144, { name: 'colorswim', desc: 'Color Swim' }],
        case 144:
          lightTheme = SWIM;
        // [160, { name: 'colorset', desc: 'Color Set' }],
        case 160:
          lightTheme = SET;
        // [177, { name: 'party', desc: 'Party', types: ['intellibrite'], sequence: 2 }],
        case 177:
          lightTheme = PARTY;
        // [178, { name: 'romance', desc: 'Romance', types: ['intellibrite'], sequence: 3 }],
        case 178:
          lightTheme = ROMANCE;
          break;
        // [179, { name: 'caribbean', desc: 'Caribbean', types: ['intellibrite'], sequence: 4 }],
        case 179:
          lightTheme = CARIBBEAN;
          break;
        // [180, { name: 'american', desc: 'American', types: ['intellibrite'], sequence: 5 }],
        case 180:
          lightTheme = AMERICAN;
          break;
        // [181, { name: 'sunset', desc: 'Sunset', types: ['intellibrite'], sequence: 6 }],
        case 181:
          lightTheme = SUNSET;
          break;
        // [182, { name: 'royal', desc: 'Royal', types: ['intellibrite'], sequence: 7 }],
        case 182:
          lightTheme = ROYALTY;
          break;
        // [190, { name: 'save', desc: 'Save', types: ['intellibrite'], sequence: 13 }],
        case 190:
          lightTheme = SAVE;
          break;
        // [191, { name: 'recall', desc: 'Recall', types: ['intellibrite'], sequence: 14 }],
        case 191:
          lightTheme = RECALL;
          break;
        // [193, { name: 'blue', desc: 'Blue', types: ['intellibrite'], sequence: 8 }],
        case 192:
          lightTheme = BLUE;
          break;
        // [194, { name: 'green', desc: 'Green', types: ['intellibrite'], sequence: 9 }],
        case 194:
          lightTheme = GREEN;
          break;
        // [195, { name: 'red', desc: 'Red', types: ['intellibrite'], sequence: 10 }],
        case 195:
          lightTheme = RED;
          break;
        // [196, { name: 'white', desc: 'White', types: ['intellibrite'], sequence: 11 }],
        case 196:
          lightTheme = WHITE;
          break
        // [197, { name: 'magenta', desc: 'Magenta', types: ['intellibrite'], sequence: 12 }],
        case 197:
          lightTheme = MAGENTA;
          break
        // [208, { name: 'thumper', desc: 'Thumper', types: ['magicstream'] }],
        case 208:
          lightTheme = MS_THUMPER;
          break
        // [209, { name: 'hold', desc: 'Hold', types: ['magicstream'] }],
        case 209:
          lightTheme = MS_HOLD;
          break
        // [210, { name: 'reset', desc: 'Reset', types: ['magicstream'] }],
        case 210:
          lightTheme = MS_RESET;
          break
        // [211, { name: 'mode', desc: 'Mode', types: ['magicstream'] }],
        // [254, { name: 'unknown', desc: 'unknow
        default:
          return Promise.reject(`Screenlogic: Unknown light theme ${lightTheme}.`);
      }


      let lightRes = await this._unit.circuits.sendLightCommandAsync(lightTheme);
      logger.silly(`Screenlogic:lightRes: ${lightRes}`);
    } catch (err) {
      return Promise.reject(err);
    }
  }
}
export class SLBodies extends SLCommands {
  public async setHeatModeAsync(body: Body, mode: number) {
    let htypes = sys.board.heaters.getInstalledHeaterTypes();
    let solarInstalled = htypes.solar > 0;
    let heatPumpInstalled = htypes.heatpump > 0;
    let ultratempInstalled = htypes.ultratemp > 0;
    let gasHeaterInstalled = htypes.gas > 0;
    let hybridInstalled = htypes.hybrid > 0;
    let slHeatMode = 0;
    switch (mode) {
      case 0:
        slHeatMode = HeatModes.HEAT_MODE_OFF;
        break;
      case 1:
        if (hybridInstalled) slHeatMode = HeatModes.HEAT_MODE_HEATPUMP;
        slHeatMode = HeatModes.HEAT_MODE_HEATER;
        break;
      case 2:
        if (hybridInstalled) slHeatMode = HeatModes.HEAT_MODE_HEATER;
        else if (solarInstalled) slHeatMode = HeatModes.HEAT_MODE_SOLARPREFERRED;
        break;
      case 3:
        if (hybridInstalled) slHeatMode = HeatModes.HEAT_MODE_SOLARPREFERRED; // ?? Should be heatpumppref but maybe this is the same?
        else if (solarInstalled) slHeatMode = HeatModes.HEAT_MODE_SOLAR;
        break;
      case 16:
        // ?? Should be Dual heat mode; maybe not supported on SL?
        break;
      default:
        logger.warn(`Screenlogic: No valid heat mode passed for ${body.name}: Mode=${mode}. `);
        return Promise.reject(`Screenlogic: No valid heat mode passed for ${body.name}: Mode=${mode}. `);

    }
    try {
      await this._unit.bodies.setHeatModeAsync(body.id, slHeatMode);
    }
    catch (err) {
      return Promise.reject(err);
    }
  }
  public async setHeatSetpointAsync(body: Body, setPoint: number) {
    try {
      await this._unit.bodies.setSetPointAsync(body.id, setPoint);
    }
    catch (err) {
      return Promise.reject(err);
    }
  }
  public async setCoolSetpointAsync(body: Body, setPoint: number) {
    try {
      await this._unit.bodies.setCoolSetPointAsync(body.id, setPoint);
    }
    catch (err) {
      return Promise.reject(err);
    }
  }
  public async cancelDalayAsync() {
    try {
      await this._unit.equipment.cancelDelayAsync();
    } catch (err) {
      return Promise.reject(err);
    }
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
export class SLChlor extends SLCommands {
  public async setChlorOutputAsync(poolSetpoint: number, spaSetpoint: number) {
    try {
      let res = await this._unit.chlor.setIntellichlorOutputAsync(poolSetpoint, spaSetpoint);
      if (!res) return Promise.reject(`Screenlogic: Unable to add schedule.`)
    } catch (err) {
      return Promise.reject(err);
    }
  }
  public async setChlorEnabledAsync(isActive: boolean) {
    try {
      let res = await this._unit.chlor.setIntellichlorIsActiveAsync(isActive);
      if (!res) return Promise.reject(`Screenlogic: Unable to add schedule.`)
    } catch (err) {
      return Promise.reject(err);
    }
  }
}
export class SLSchedule extends SLCommands {
  public async addScheduleAsync(type: number) {
    // Passed as an argument to the emitted addNewScheduleEvent event. Adds a new event to the specified schedule type, either 0 for regular events or 1 for one-time events.
    let slRet = this._unit.schedule.addNewScheduleEventAsync(0);
    return (await slRet).val;
  }
  // SCHEDULES

  //  let addSched = await client.schedule.addNewScheduleEvent(SchedTypes.RECURRING);
  //  logger.silly(`Screenlogic:Add sched response: ${addSched}`);
  //  let setSched = await client.schedule.setScheduleEventById(10, 2,500,1200,127,0,1,99);
  //  logger.silly(`Screenlogic:Set sched result: ${setSched}`);
  //  let delSched = await client.schedule.deleteScheduleEventById(10);
  //  logger.silly(`Screenlogic:Deleted sched result: ${delSched}`);
  public async setScheduleAsync(id: number, circuit: number, startTime: number, endTime: number, schedDays: number, schedType: number, changeHeatSetPoint: boolean, heatSource?: number, setPoint?: number): Promise<number> {
    /*
  scheduleId - id of a schedule previously created, see SLAddNewScheduleEvent
  circuitId - id of the circuit to which this event applies
  startTime - the start time of the event, specified as minutes since midnight (see conversion functions)
  example: 6:00am would be 360
  example: 6:15am would be 375
  stopTime - the stop time of the event, specified as minutes since midnight (see conversion functions)
  dayMask
  7-bit mask that determines which days the schedule is active for, MSB is always 0, valid numbers 1-127
  flags
  bit 0 is the schedule type, if 0 then regular event, if 1 its a run-once
  bit 1 indicates whether heat setPoint should be changed
  heatCmd - integer indicating the desired heater mode. Valid values are:
  ScreenLogic.HEAT_MODE_OFF
  ScreenLogic.HEAT_MODE_SOLAR
  ScreenLogic.HEAT_MODE_SOLARPREFERRED
  ScreenLogic.HEAT_MODE_HEATPUMP
  ScreenLogic.HEAT_MODE_DONTCHANGE
  heatSetPoint - the temperature set point if heat is to be changed (ignored if bit 1 of flags is 0)
    */
    try {

      // if the id doesn't exist - we need to add a new schedule and then edit it;
      // this may not match our assigned id and we need to override it.
      let flags = 0;
      if (schedType === 26) {
        // 0 = repeat; 26 = run once
        flags = 1;
      }
      if (id <= 0) {
        id = await this.addScheduleAsync(flags);
      }

      let SLheatSource = 0;
      if (changeHeatSetPoint) {
        flags = flags | (1 << 1);
        let htypes = sys.board.heaters.getInstalledHeaterTypes();
        let solarInstalled = htypes.solar > 0;
        let heatPumpInstalled = htypes.heatpump > 0;
        let ultratempInstalled = htypes.ultratemp > 0;
        let gasHeaterInstalled = htypes.gas > 0;
        let hybridInstalled = htypes.hybrid > 0;
        switch (heatSource) {
          case 0:
            SLheatSource = HeatModes.HEAT_MODE_OFF;
            break;
          case 3:
            if (hybridInstalled) SLheatSource = HeatModes.HEAT_MODE_HEATPUMP;
            SLheatSource = HeatModes.HEAT_MODE_HEATER;
            break;
          case 5:
            if (hybridInstalled) SLheatSource = HeatModes.HEAT_MODE_SOLARPREFERRED; // ?? Should be heatpumppref but maybe this is the same?
            else if (solarInstalled) SLheatSource = HeatModes.HEAT_MODE_SOLAR;
            break;
          case 21:
            if (hybridInstalled) SLheatSource = HeatModes.HEAT_MODE_HEATER;
            else if (solarInstalled) SLheatSource = HeatModes.HEAT_MODE_SOLARPREFERRED;
            break;
          case 32:
            // No change
            SLheatSource = HeatModes.HEAT_MODE_DONTCHANGE;
            break;
          default:
            logger.warn(`Screenlogic: No valid heat source passed for schedule: ${id}, heat source: ${heatSource}. `);
            SLheatSource = 0;
            flags = 1;
        }
      }
      await this._unit.schedule.setScheduleEventByIdAsync(id, circuit, startTime, endTime, schedDays, flags, SLheatSource, setPoint);
      return id;
    } catch (err) {
      logger.error(`Screenlogic: Error setting schedule ${id}`)
    }
  }
  public async deleteScheduleAsync(id: number) {
    try {
      await this._unit.schedule.deleteScheduleEventByIdAsync(id);
    } catch (err) {
      return Promise.reject(err);
    }
  }
  public async setEggTimerAsync(id: number, runTime: number) {
    try {
      await this._unit.circuits.setCircuitRuntimebyIdAsync(id, runTime);
    } catch (err) {
      return Promise.reject(err);
    }
  }
  public async deleteEggTimerAsync(id: number) {
    try {
      await this._unit.circuits.setCircuitRuntimebyIdAsync(id, 720);
    } catch (err) {
      return Promise.reject(err);
    }
  }
}
export class SLPump extends SLCommands {
  public async setPumpSpeedAsync(pump: Pump, circuit: PumpCircuit) {

    // PUMPS
    // let pumpRes = await client.pump.setPumpSpeed(0,1,2000,true);
    // Currently, this only sets the pump circuit speed.  Adding/removing pump needs to be
    // done through the equipment configuration message.

    // This API call is indexed based.
    let pumpCircuits = pump.circuits.get();
    for (let i = 0; i < pumpCircuits.length; i++) {
      if (pumpCircuits[i].circuit === circuit.circuit) {
        let res = await this._unit.pump.setPumpSpeedAsync(pump.id, i, circuit.speed || circuit.flow, (circuit.speed || circuit.flow) > 400);
        if (res) {
          let pc = pump.circuits.getItemByIndex(i);
          pc.speed = typeof circuit.speed !== 'undefined' ? circuit.speed : pc.speed;
          pc.flow = typeof circuit.flow !== 'undefined' ? circuit.flow : pc.flow;
          return Promise.resolve(pump);
        }
        else {
          return Promise.reject(new InvalidEquipmentDataError('Unable to set pump speed', 'pump', pump))
        };
      }
    }
    return Promise.reject(new InvalidEquipmentDataError('Unable to set pump speed.  Circuit not found', 'pump', pump));

  }
}
export class SLController extends SLCommands {
  public async setEquipmentAsync(obj?: any, eq?: string) {

    let poolPumpOnDuringHeaterCooldown = false;
    let spaPumpOnDuringHeaterCooldown = false;
    for (let i = 0; i < sys.bodies.length; i++) {
      let bs = state.temps.bodies.getItemById(i + 1);
      if (bs.circuit === 1) spaPumpOnDuringHeaterCooldown = bs.heaterCooldownDelay;
      else if (bs.circuit === 6) poolPumpOnDuringHeaterCooldown = bs.heaterCooldownDelay;
    }

    let highSpeedCircuits = sys.pumps.getDualSpeed().circuits.toArray();
    let valves = sys.valves.get(true);
    let remotes = sys.remotes.get(true);
    let heaters = sys.heaters.get(true);
    let misc = { ...sys.general.options.get(), poolPumpOnDuringHeaterCooldown, spaPumpOnDuringHeaterCooldown, intellichem: state.chemControllers.getItemById(1, false).isActive || false };
    let circuitGroup = sys.circuitGroups.get(true);
    let lightGroup = sys.lightGroups.get(true)[0];
    let pumps = sys.pumps.get(true);
    const spaCommand: Remote = sys.remotes.getItemById(8).get();
    let alarm = 0;

    switch (eq) {
      case 'misc': {
        misc = extend({}, true, misc, obj);
        break;
      }
      case 'lightGroup': {
        lightGroup = extend({}, true, lightGroup, obj);
        break;
      }
      case 'pump': {
        let idx = pumps.findIndex(el => { console.log(el.id); return el.id === obj.id; })
        if (idx >= 0) pumps = extend({}, true, pumps[idx], obj);
        else return Promise.reject(`Screenlogic: No pump found by that id: ${obj}`);
        break;
      }
      case 'heater': {
        let idx = heaters.findIndex(el => { console.log(el.id); return el.id === obj.id; })
        if (idx >= 0) heaters = extend({}, true, heaters[idx], obj);
        else return Promise.reject(`Screenlogic: No pump found by that id: ${obj}`);
        break;
      }
    }

    let data = {
      highSpeedCircuits,
      valves,
      remotes,
      heaters,
      misc,
      circuitGroup,
      lightGroup,
      pumps,
      spaCommand,
      alarm
    }
    return Promise.reject(new InvalidOperationError('Operation not implemented yet.', 'setEquipmentConfigurationAsync'));
    // await this._unit.equipment.setEquipmentConfigurationAsync(data);
  }

  public async setSystemTime() {
    try {
      let sysTime = await this._unit.equipment.setSystemTimeAsync(state.time.toDate(), sys.general.options.adjustDST);
      logger.silly(`Screenlogic:set time result: ${sysTime}`);
    } catch (error) {
      return Promise.reject(new InvalidOperationError('Unable to set system time.', error.message));
    }
  }
  public async setCustomName(idx: number, name: string) {
    try {
      let ack = await this._unit.equipment.setCustomNameAsync(idx, name);
      logger.silly(`Screenlogic:set custom name result: ${JSON.stringify(ack)}`);
    } catch (error) {
      return Promise.reject(new InvalidOperationError('Unable to set custom name.', error.message));
    }
  }
}
export let sl = new ScreenLogicComms();
