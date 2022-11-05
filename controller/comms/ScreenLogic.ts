import { ControllerType } from '../../controller/Constants';
import { sys } from '../../controller/Equipment';
import { state } from '../../controller/State';
import * as ScreenLogic from 'node-screenlogic';

export class ScreenLogicComms {

  constructor() { };

  public async connectAsync() {

    const systemName = 'Pentair: 00-45-F4';
    const password = '1111';

    let gateway = new ScreenLogic.RemoteLogin(systemName);
    var unit = await gateway.connect();

    if (!unit || !unit.gatewayFound || unit.ipAddr === '') {
      console.log('no unit found by that name');
      return;
    }
    console.log('unit ' + gateway.systemName + ' found at ' + unit.ipAddr + ':' + unit.port);
    let client = ScreenLogic.screenlogic
    let delayCount = 0;

    try {
      client.init(unit.ipAddr, unit.port, password, 12345);
      await client.connect();
      let addClient = await client.addClient();
      console.log(`Add client result: ${addClient}`);
      // let controller = await client.equipment.getControllerConfig();
      // console.log(`Controller: ${JSON.stringify(controller,null,2)}`);
      let controller = await client.equipment.getControllerConfig();
      console.log(`Controller: ${JSON.stringify(controller,null,2)}`);
      let equipConfig = await client.equipment.getEquipmentConfiguration();
      console.log(`Equipment config: ${JSON.stringify(equipConfig,null,2)}`);
      let equipmentState = await client.equipment.getEquipmentState();
      console.log(`Equipment State: ${JSON.stringify(equipmentState,null,2)}`);

      let combined = {
        equipConfig,
        equipmentState
      }

      /* // EQUIPMENT
      let equipmentState = await client.equipment.getEquipmentState();
      console.log(`Equipment State: ${JSON.stringify(equipmentState)}`);
      let result = await client.getVersion();
      console.log(`Pool Version: ${result}`);
      let controller = await client.equipment.getControllerConfig();
      console.log(`Controller: ${JSON.stringify(controller)}`);
      let equipConfig = await client.equipment.getEquipmentConfiguration();
      console.log(`Equipment config: ${JSON.stringify(equipConfig)}`);
      let cancelDelay = await client.equipment.cancelDelay();
      console.log(`Cancel delay: ${cancelDelay}`);
      let weatherForecast = await client.equipment.getWeatherForecast();
      console.log(`Weather: ${JSON.stringify(weatherForecast)}`); 
      let systemTime = await client.equipment.getSystemTime();
      console.log(`System Time: ${JSON.stringify(systemTime)}`)
      let dt = systemTime.date;
      dt.setHours(12); 
      let sysTime = await screenlogic.equipment.setSystemTime(dt, true);
      console.log(`set time result: ${sysTime}`);
      let hist = await screenlogic.equipment.getHistoryData()
      console.log(`history data: ${JSON.stringify(hist)}`)
  
      // CHLOR
      let intellichlor = await client.chlor.getIntellichlorConfig();
      console.log(`Intellichlor: ${JSON.stringify(intellichlor)}`);
      let chlorOutput = await client.chlor.setIntellichlorOutput(12,0);
      console.log(`Chlor output: ${JSON.stringify(chlorOutput)}`)
  
      // CHEM
      let chem = await client.chem.getChemicalData();
      console.log(`Chem data: ${JSON.stringify(chem)}`);
      let chemHist = await screenlogic.chem.getChemHistoryData()
      console.log(`history data: ${JSON.stringify(chemHist)}`)
  
      // SCHEDULES
      let recurringSched = await client.schedule.getScheduleData(0);
      console.log(`reccuring schedules: ${JSON.stringify(recurringSched)}`);
      let runOnceSched = await client.schedule.getScheduleData(1);
      console.log(`Run once schedules: ${JSON.stringify(runOnceSched)}`);
      let addSched = await client.schedule.addNewScheduleEvent(SchedTypes.RECURRING);
      console.log(`Add sched response: ${addSched}`);
      let setSched = await client.schedule.setScheduleEventById(10, 2,500,1200,127,0,1,99);
      console.log(`Set sched result: ${setSched}`);
      let delSched = await client.schedule.deleteScheduleEventById(10);
      console.log(`Deleted sched result: ${delSched}`);
  
      // PUMPS
      let pumpStatus = await client.pump.getPumpStatus(0);
      console.log(`Pump 0: ${JSON.stringify(pumpStatus)}`);
      let pumpRes = await client.pump.setPumpSpeed(0,1,2000,true);
      console.log(`Pump speed response: ${pumpRes}`)
      
      // BODIES
      let setPointChanged = await client.bodies.setSetPoint(1, 101)
      console.log(`set point changed: ${setPointChanged}`);
      let heatModeRes = await client.bodies.setHeatMode(1, HeatModes.HEAT_MODE_HEATPUMP);
      console.log(`heat mode result: ${heatModeRes}`);
      
      // CIRCUITS
      let lightRes = await client.circuits.sendLightCommand(LightCommands.LIGHT_CMD_COLOR_MODE_PARTY);
      console.log(`Light result: ${lightRes}`);
      // NOT WORKING...    
      let cstate = await client.circuits.setCircuitState(3, true);
      console.log(`Circuit state: ${JSON.stringify(cstate)}`);
      let circRun = await client.circuits.setCircuitRuntimebyId(4, 5);
      console.log(`circ run res: ${circRun}`);
   */
      setTimeout(async () => {
        console.log(`closing connection after 60s`);
        await client.close();
      }, 60 * 1000)
      console.log(`Waiting 60s.`)
    } catch (error) {
      console.log(`Error: ${error.message}`);
      client.close();
    }
  }

}

class Controller {
  public decodeConfig(config: SLControllerConfigData) {


  }
  public decodeEquipment(equip: SLEquipmentConfigurationData) {
    if (sys.controllerType !== ControllerType.EasyTouch && this.isEasyTouch(equip.controllerType)) {
      sys.controllerType = ControllerType.EasyTouch;
    }
    else if (sys.controllerType !== ControllerType.IntelliTouch && this.isIntelliTouch(equip.controllerType)) {
      sys.controllerType = ControllerType.IntelliTouch;
    }


    this.decodeHeaters(equip.heaterConfig)
  }
  public decodeHeaters(heaterConfig: HeaterConfig) {
    let hasHeatpump: boolean;
    if (heaterConfig.thermaFloCoolPresent) {
      sys.heaters.removeItemById(1);
      state.heaters.removeItemById(1);
      sys.heaters.removeItemById(2);
      state.heaters.removeItemById(2);
      sys.heaters.removeItemById(3);
      state.heaters.removeItemById(3);
      let hybrid = sys.heaters.getItemById(4, true);
      let shybrid = state.heaters.getItemById(4, true);
      // [5, { name: 'hybrid', desc: 'Hybrid', hasAddress: true }],
      shybrid.type = hybrid.type = 5;
      hybrid.address = 112; // Touch only supports address 1.
      hybrid.isActive = true;
      hybrid.master = 0;
      hybrid.body = sys.equipment.shared ? 32 : 0;
      if (typeof hybrid.name === 'undefined') shybrid.name = hybrid.name = 'UltraTemp ETi';
      // The following 2 values need to come from somewhere.
      if (typeof hybrid.economyTime === 'undefined') hybrid.economyTime = 1;
      if (typeof hybrid.maxBoostTemp === 'undefined') hybrid.maxBoostTemp = 5;
      hasHeatpump = false; // You cannot have a heatpump and a hybrid heater.
    }
    else {
      // Hybrid heaters and gas heaters cannot co-exist but it appears you cannot disable the gas
      // heater on the touch panels.
      sys.heaters.removeItemById(4);
      state.heaters.removeItemById(4);
      let heater = sys.heaters.getItemById(1, true);
      let hstate = state.heaters.getItemById(1, true);
      heater.body = sys.equipment.shared ? 32 : 0;
      // [1, { name: 'gas', desc: 'Gas Heater', hasAddress: false }],
      heater.type = hstate.type = 1;
      heater.isActive = true;
      heater.master = 0;
      if (typeof heater.name === 'undefined') heater.name = hstate.name = 'Gas Heater';
      if (typeof heater.cooldownDelay === 'undefined') heater.cooldownDelay = 5;
    }
    // Check to see if a heatpump is installed.  This will replace the solar heater so they cannot coexist.
    if (hasHeatpump) {
      // Remove the solar heater.  This will be replaced with the heatpump.
      sys.heaters.removeItemById(2);
      state.heaters.removeItemById(2);
      let heatpump = sys.heaters.getItemById(3, true);
      let sheatpump = state.heaters.getItemById(3, true);
      // [3, { name: 'heatpump', desc: 'Heat Pump', hasAddress: true, hasPreference: true }],
      heatpump.type = sheatpump.type = 3;
      heatpump.body = sys.equipment.shared ? 32 : 0;
      heatpump.isActive = true;
      heatpump.master = 0;

      if (typeof heatpump.name === 'undefined') sheatpump.name = heatpump.name = 'UltraTemp';
      // heatpump.heatingEnabled = (msg.extractPayloadByte(1) & 0x01) === 1;
      // heatpump.coolingEnabled = (msg.extractPayloadByte(1) & 0x02) === 2;
      sys.board.equipmentIds.invalidIds.add(20); // exclude Aux Extra
    }
    else if (heaterConfig.poolSolarPresent) {
      sys.heaters.removeItemById(3);
      state.heaters.removeItemById(3);
      let solar = sys.heaters.getItemById(2, true);
      let ssolar = sys.heaters.getItemById(2, true);
      // [2, { name: 'solar', desc: 'Solar Heater', hasAddress: false, hasPreference: true }],
      solar.type = ssolar.type = 2;
      solar.body = sys.equipment.shared ? 32 : 0;
      solar.isActive = true;
      solar.master = 0;
      if (typeof solar.name === 'undefined') solar.name = ssolar.name = 'Solar Heater';
      // solar.freeze = (msg.extractPayloadByte(1) & 0x80) >> 7 === 1;
      // solar.coolingEnabled = (msg.extractPayloadByte(1) & 0x20) >> 5 === 1;
      // solar.startTempDelta = ((msg.extractPayloadByte(2) & 0xE) >> 1) + 3;
      // solar.stopTempDelta = ((msg.extractPayloadByte(2) & 0xC0) >> 6) + 2;
      sys.board.equipmentIds.invalidIds.add(20); // exclude Aux Extra
    }
    else {
      sys.board.equipmentIds.invalidIds.remove(20); // Allow access to Aux Extra
    }
  }

  isEasyTouch(controllerType) {
    return controllerType === 14 || controllerType === 13;
  }

  isIntelliTouch(controllerType) {
    return controllerType !== 14 && controllerType !== 13 && controllerType !== 10;
  }

  isEasyTouchLite(controllerType, hwType) {
    return controllerType === 13 && (hwType & 4) !== 0;
  }

  isDualBody(controllerType) {
    return controllerType === 5;
  }
}

export let sl = new ScreenLogicComms();

export interface SLEquipmentStateData {
  ok: number;
  freezeMode: number;
  remotes: number;
  poolDelay: number;
  spaDelay: number;
  cleanerDelay: number;
  airTemp: number;
  bodiesCount: number;
  bodies: {}[],
  currentTemp: any[];
  heatStatus: any[];
  setPoint: any[];
  coolSetPoint: any[];
  heatMode: any[];
  circuitArray: any[];
  pH: number;
  orp: number;
  saturation: number;
  saltPPM: number;
  pHTank: number;
  orpTank: number;
  alarms: number;
}
export interface SLControllerConfigData {
  controllerId: number;
  minSetPoint: number[];
  maxSetPoint: number[];
  degC: boolean;
  controllerType;
  circuitCount: number,
  hwType;
  controllerData;
  equipFlags;
  genCircuitName;
  interfaceTabFlags: number;
  bodyArray: any[];
  colorCount: number;
  colorArray: any[];
  pumpCircCount: number;
  pumpCircArray: any[];
  showAlarms: number;
}

export interface SLSystemTimeData {
  date: Date;
  year: any;
  month: any;
  dayOfWeek: any;
  day: any;
  hour: any;
  minute: any;
  second: any;
  millisecond: any;
  adjustForDST: boolean;
}

export interface SLEquipmentConfigurationData {
  controllerType: number;
  hardwareType: number;
  expansionsCount: number;
  version: number;
  heaterConfig: HeaterConfig;
  valves: any[];
  delays: Delays;
  misc: Misc;
}

export interface HeaterConfig {
  poolSolarPresent: boolean,
  spaSolarPresent: boolean,
  thermaFloCoolPresent: boolean,
  solarHeatPumpPresent: boolean,
  thermaFloPresent: boolean,
}

export interface Delays {
  poolPumpOnDuringHeaterCooldown: boolean,
  spaPumpOnDuringHeaterCooldown: boolean,
  pumpOffDuringValveAction
}

export interface Misc {
  intelliChem: boolean,
  spaManualHeat: boolean
}

export interface Valves {
  loadCenterIndex: number,
  valveIndex: number,
  valveName: string,
  loadCenterName: string,
  deviceId: any
}

export interface SLWeatherForecastData {
  version: number;
  zip: string;
  lastUpdate: Date;
  lastRequest: Date;
  dateText: string;
  text: string;
  currentTemperature: number;
  humidity: number;
  wind: string;
  pressure: number;
  dewPoint: number;
  windChill: number;
  visibility: number;
  dayData: SLWeatherForecastDayData[];
  sunrise: number;
  sunset: number;
}
export interface SLWeatherForecastDayData {
  dayTime: Date;
  highTemp: number;
  lowTemp: number;
  text: string;
}

export interface TimeTimePointPairs {
  on: Date;
  off: Date;
}
export interface TimeTempPointPairs {
  time: Date;
  temp: number;
}

export interface SLHistoryData {
  airTemps: TimeTempPointPairs[];
  poolTemps: TimeTempPointPairs[];
  poolSetPointTemps: TimeTempPointPairs[];
  spaTemps: TimeTempPointPairs[];
  spaSetPointTemps: TimeTempPointPairs[];
  poolRuns: TimeTimePointPairs[];
  spaRuns: TimeTimePointPairs[];
  solarRuns: TimeTimePointPairs[];
  heaterRuns: TimeTimePointPairs[];
  lightRuns: TimeTimePointPairs[];
}
