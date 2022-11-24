import { ControllerType, utils } from '../../controller/Constants';
import { LightGroup, LightGroupCircuit, sys, Valve, Body } from '../../controller/Equipment';
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
// 
// Done
// all equipment, heat mode, heat setpoint, circuit state, set/add/delete schedules, cancel delay, set circuit, set circuit runtime
// issues - not catching all pipe, econnreset errors ==> Us PM2 to monitor process for now

export class ScreenLogicComms {
  constructor() {
    this._client = ScreenLogic.screenlogic;
  };
  public counter: SLCounter = new SLCounter();
  private _gateway: ScreenLogic.RemoteLogin;
  private _client: ScreenLogic.UnitConnection;
  private _pollTimer: NodeJS.Timeout;
  public circuits: SLCircuits;
  public bodies: SLBodies;
  public chlor: SLChlor;
  public schedules: SLSchedule;
  private _pollCountError: number = 0;
  public isOpen: boolean = false;
  private _cfg: any;
  private _configData: { pumpsReported: number[], intellichemPresent: boolean };
  private pollingInterval = 10000;
  public enabled: boolean = false;

  public async initAsync() {
    let self = this;
    process.stdout.on('error', function (err) {
      if (err.code == "EPIPE") {
        process.exit(0);
      }
    });
    this.circuits = new SLCircuits(this._client);
    this.bodies = new SLBodies(this._client);
    this.chlor = new SLChlor(this._client);
    this.schedules = new SLSchedule(this._client);
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
      try {
        this._client.init(unit.ipAddr, unit.port, password);
        await this._client.connectAsync();
        let ver = await this._client.getVersionAsync();
        logger.info(`Screenlogic: connect to ${systemName} ${ver} at ${unit.ipAddr}:${unit.port}`);

        let addClient = await this._client.addClientAsync();
        console.log(`Add client result: ${addClient}`);
      } catch (err) {
        throw err;
      }

      state.status = sys.board.valueMaps.controllerStatus.transform(2, 12);
      state.emitControllerChange();
      try {
        let equipConfig = await this._client.equipment.getEquipmentConfigurationAsync();
        console.log(`Equipment config: ${JSON.stringify(equipConfig, null, 2)}`);
        await Controller.decodeEquipment(equipConfig);
      } catch (err) {
        logger.error(`Screenlogic: Error getting equipment configuration. ${err.message}`);
      }

      state.status = sys.board.valueMaps.controllerStatus.transform(2, 24);
      state.emitControllerChange();
      try {

        let customNames = await this._client.equipment.getCustomNamesAsync();
        console.log(customNames);
        await Controller.decodeCustomNames(customNames);
      } catch (err) {
        logger.error(`Screenlogic: Error getting custom names. ${err.message}`);
      }

    state.status = sys.board.valueMaps.controllerStatus.transform(2, 36);
    state.emitControllerChange();
      try {
        let controller = await this._client.equipment.getControllerConfigAsync();
        console.log(`Controller: ${JSON.stringify(controller, null, 2)}`);
        this._configData = await Controller.decodeController(controller);
      } catch (err) {
        logger.error(`Screenlogic: Error getting controller configuration. ${err.message}`);
      }

    state.status = sys.board.valueMaps.controllerStatus.transform(2, 48);
    state.emitControllerChange();
      try {
        let systemTime = await this._client.equipment.getSystemTimeAsync();
        // console.log(`System Time: ${JSON.stringify(systemTime)}`)
        Controller.decodeDateTime(systemTime);
      } catch (err) {
        logger.error(`Screenlogic: Error getting system time. ${err.message}`);
      }

      // PUMPS
      
    state.status = sys.board.valueMaps.controllerStatus.transform(2, 60);
    state.emitControllerChange();
      this._configData.pumpsReported.forEach(async pumpNum => {
        try {
          let pumpStatus = await this._client.pump.getPumpStatusAsync(pumpNum - 1);
          console.log(`Pump ${pumpNum}: ${JSON.stringify(pumpStatus)}`);
          await Controller.decodePump(pumpNum, pumpStatus);
        } catch (err) {
          logger.error(`Screenlogic: Error getting pump configuration. ${err.message}`);
        }
      })

    state.status = sys.board.valueMaps.controllerStatus.transform(2, 72);
    state.emitControllerChange();
      try {
      let recurringSched = await this._client.schedule.getScheduleDataAsync(0);
      console.log(`reccuring schedules: ${JSON.stringify(recurringSched)}`);
      let runOnceSched = await this._client.schedule.getScheduleDataAsync(1);
      console.log(`Run once schedules: ${JSON.stringify(runOnceSched)}`);
      await Controller.decodeSchedules(recurringSched, runOnceSched);
    } catch (err) {
      logger.error(`Screenlogic: Error getting schedules. ${err.message}`);
    }

    state.status = sys.board.valueMaps.controllerStatus.transform(2, 84);
      state.emitControllerChange();
    try {
      let intellichlor = await this._client.chlor.getIntellichlorConfigAsync();
      // console.log(`Intellichlor: ${JSON.stringify(intellichlor)}`);
      await Controller.decodeIntellichlor(intellichlor);
    } catch (err) {
      logger.error(`Screenlogic: Error getting Intellichlor. ${err.message}`);
    }

    state.status = sys.board.valueMaps.controllerStatus.transform(2, 95);
      state.emitControllerChange();
    try {
      if (this._configData.intellichemPresent){
        let chem = await this._client.chem.getChemicalDataAsync();
        console.log(`Chem data: ${JSON.stringify(chem)}`);
        await Controller.decodeChemController(chem);
      }
    } catch (err) {
      logger.error(`Screenlogic: Error getting Intellichem. ${err.message}`);
    }

    state.status = sys.board.valueMaps.controllerStatus.transform(2, 98);
      state.emitControllerChange();
    try {
      let equipmentState = await this._client.equipment.getEquipmentStateAsync();
      console.log(equipmentState);
      await Controller.decodeEquipmentState(equipmentState);
    } catch (err) {
      logger.error(`Screenlogic: Error getting equipment state. ${err.message}`);
    }
    sys.board.circuits.syncVirtualCircuitStates()
    state.status = sys.board.valueMaps.controllerStatus.transform(1, 100);
      state.emitControllerChange();

      this._client.on('equipmentState', async function (data) { await Controller.decodeEquipmentState(data); })
      this._client.on('intellichlorConfig', async function (data) {
        await Controller.decodeIntellichlor(data);
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
        let recurringSched = await self._client.schedule.getScheduleDataAsync(0);
        console.log(`reccuring schedules: ${JSON.stringify(recurringSched)}`);

        let runOnceSched = await self._client.schedule.getScheduleDataAsync(1);
        console.log(`Run once schedules: ${JSON.stringify(runOnceSched)}`);
        await Controller.decodeSchedules(recurringSched, runOnceSched);
      });
      this._client.on('setCircuitRuntimebyId', async (data) => {
        console.log(`Set Circuit By Runtime event ${data}`);
        await self._client.equipment.getControllerConfigAsync();
      });
      this._client.on('error', async (e) => {
        // if the error event from the net.socket isn't caught, it sometimes crashes the app.
        logger.error(`Screenlogic error (net.socket): ${e.message}`);
        if (e.code === 'ECONNRESET') {
          try {
            logger.info(`Screenlogic net.socket timeout.  Restarting.`)
            await self.stopAsync();
            await self.initAsync();
          }
          catch (err) {
            logger.error(`Error trying to reset Screenlogic comms. ${err.message}`);
          };
        }
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
      
      

      let weatherForecast = await client.equipment.getWeatherForecast();
      console.log(`Weather: ${JSON.stringify(weatherForecast)}`); 
      let sysTime = await screenlogic.equipment.setSystemTime(dt, true);
      console.log(`set time result: ${sysTime}`);
      let hist = await screenlogic.equipment.getHistoryData()
      console.log(`history data: ${JSON.stringify(hist)}`)
    
      
      // CHEM
      let chemHist = await screenlogic.chem.getChemHistoryData()
      console.log(`history data: ${JSON.stringify(chemHist)}`)
      
 

      // PUMPS
      // let pumpRes = await client.pump.setPumpSpeed(0,1,2000,true);
      // console.log(`Pump speed response: ${pumpRes}`)
      

      


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
      sys.board.heaters.syncHeaterStates();
      sys.board.schedules.syncScheduleStates();
      sys.board.circuits.syncVirtualCircuitStates();
    }
    catch (err) {
      logger.error(`Error polling screenlogic (${this._pollCountError} errors)- ${err}`); this._pollCountError++;
      if (this._pollCountError > 3) {
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
    };
    if (config.equipment.POOL_IFLOWPRESENT1) {
      pumpsReported.push(2);
    };
    if (config.equipment.POOL_IFLOWPRESENT2) {
      pumpsReported.push(3);
    };
    if (config.equipment.POOL_IFLOWPRESENT3) {
      pumpsReported.push(4);
    };
    if (config.equipment.POOL_IFLOWPRESENT4) {
      pumpsReported.push(5);
    };
    if (config.equipment.POOL_IFLOWPRESENT5) {
      pumpsReported.push(6);
    };
    if (config.equipment.POOL_IFLOWPRESENT6) {
      pumpsReported.push(7);
    };
    if (config.equipment.POOL_IFLOWPRESENT7) {
      pumpsReported.push(8);
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

    await sys.board.chemControllers.setChemControllerAsync(data, false);
    let schem = state.chemControllers.getItemById(1);
    schem.ph.level = slchem.pH;
    schem.orp.level = slchem.orp;
    schem.saturationIndex = slchem.saturation;
    schem.alarms.bodyFault = slchem.error ? 1 : 0; // maybe a better place to assign the error? 
    state.emitEquipmentChanges();

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
    let pump = sys.pumps.getItemById(id);
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
      circuits: [],
      id: pump.isActive ? pump.id : undefined
    };
    for (let i = 0; i < slpump.pumpCircuits.length; i++) {
      if (slpump.pumpCircuits[i].circuitId === 0) continue;
      let pumpCirc = {
        circuit: slpump.pumpCircuits[i].circuitId,
        speed: slpump.pumpCircuits[i].isRPMs ? slpump.pumpCircuits[i].speed : undefined,
        flow: slpump.pumpCircuits[i].isRPMs ? undefined : slpump.pumpCircuits[i].speed
      }
      data.circuits[i] = pumpCirc;
    }
    data.type = ptype;
    data.name = typeof pump.name !== 'undefined' ? pump.name : `Pump ${id}`
    // pump.set(data);
    await sys.board.pumps.setPumpAsync(data, false);
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
      console.log(`lightRes: ${lightRes}`);
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
        slHeatMode = ScreenLogic.HeatModes.HEAT_MODE_OFF;
        break;
      case 1:
        if (hybridInstalled) slHeatMode = ScreenLogic.HeatModes.HEAT_MODE_HEATPUMP;
        slHeatMode = ScreenLogic.HeatModes.HEAT_MODE_HEATER;
        break;
      case 2:
        if (hybridInstalled) slHeatMode = ScreenLogic.HeatModes.HEAT_MODE_HEATER;
        else if (solarInstalled) slHeatMode = ScreenLogic.HeatModes.HEAT_MODE_SOLARPREFERRED;
        break;
      case 3:
        if (hybridInstalled) slHeatMode = ScreenLogic.HeatModes.HEAT_MODE_SOLARPREFERRED; // ?? Should be heatpumppref but maybe this is the same?
        else if (solarInstalled) slHeatMode = ScreenLogic.HeatModes.HEAT_MODE_SOLAR;
        break;
      case 16:
        // ?? Should be Dual heat mode; maybe not supported on SL?
        break;
      default:
        logger.warn(`Screenlogic: No valid heat mode passed for ${body.name}: Mode=${mode}. `);
        return Promise.reject(`Screenlogic: No valid heat mode passed for ${body.name}: Mode=${mode}. `);

    }
    try {
      await this._unit.bodies.setHeatModeAsync(body.id - 1, slHeatMode);
    }
    catch (err) {
      return Promise.reject(err);
    }
  }
  public async setHeatSetpointAsync(body: Body, setPoint: number) {
    try {
      await this._unit.bodies.setSetPointAsync(body.id - 1, setPoint);
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
  public async setChlorAsync(poolSetpoint: number, spaSetpoint: number) {
    try {
      let res = await this._unit.chlor.setIntellichlorOutputAsync(poolSetpoint, spaSetpoint);
      if (!res) return Promise.reject(`Screenlogic: Unable to add schedule.`)
    } catch (err) {
      return Promise.reject(err);
    }
  }
}
export class SLSchedule extends SLCommands {
  public async addScheduleAsync(type: number) {
    // Passed as an argument to the emitted addNewScheduleEvent event. Adds a new event to the specified schedule type, either 0 for regular events or 1 for one-time events.
    let id = this._unit.schedule.addNewScheduleEventAsync(0);
    return id;
  }
  // SCHEDULES

  //  let addSched = await client.schedule.addNewScheduleEvent(SchedTypes.RECURRING);
  //  console.log(`Add sched response: ${addSched}`);
  //  let setSched = await client.schedule.setScheduleEventById(10, 2,500,1200,127,0,1,99);
  //  console.log(`Set sched result: ${setSched}`);
  //  let delSched = await client.schedule.deleteScheduleEventById(10);
  //  console.log(`Deleted sched result: ${delSched}`);
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
            SLheatSource = ScreenLogic.HeatModes.HEAT_MODE_OFF;
            break;
          case 3:
            if (hybridInstalled) SLheatSource = ScreenLogic.HeatModes.HEAT_MODE_HEATPUMP;
            SLheatSource = ScreenLogic.HeatModes.HEAT_MODE_HEATER;
            break;
          case 5:
            if (hybridInstalled) SLheatSource = ScreenLogic.HeatModes.HEAT_MODE_SOLARPREFERRED; // ?? Should be heatpumppref but maybe this is the same?
            else if (solarInstalled) SLheatSource = ScreenLogic.HeatModes.HEAT_MODE_SOLAR;
            break;
          case 21:
            if (hybridInstalled) SLheatSource = ScreenLogic.HeatModes.HEAT_MODE_HEATER;
            else if (solarInstalled) SLheatSource = ScreenLogic.HeatModes.HEAT_MODE_SOLARPREFERRED;
            break;
          case 32:
            // No change
            SLheatSource = ScreenLogic.HeatModes.HEAT_MODE_DONTCHANGE;
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
export let sl = new ScreenLogicComms();
