import * as React from "react";
var extend = require("extend");
import {
  incoming,
  emitSocket,
  hidePanel,
  setPumpConfigCircuit
} from "./Socket_Client";
// import Layout from './Layout';
import Navbar from "./Navbar";
import SysInfo from "./SysInfo";
import { Container } from "reactstrap";

import BodyState from "./BodyState";
import Pump from "./Pumps";
import Circuits from "./Circuits";
import Schedule from "./Schedules";
import Chlorinator from "./Chlorinator";
/*import EggTimer from './EggTimer/EggTimer'
import ShouldDisplay from './ShouldDisplay'
import Light from './Light/Light'
import DebugLog from './DebugLog'
import Footer from './Footer' */

export interface IPoolSystem {
  _config: IConfig;
  _state: IState;
  counter: number;
}

export interface IState {
  temps: IStatePoolTemp;
  pumps: IStatePoolPump[];
  mode: IDetail;
  equipment: any;
  valves: any[];
  heaters: any[];
  circuits: IStateCircuit[];
  features: IStateCircuit[];
  chlorinators: IStateChlorinator[];
  schedules: IStateSchedule[];
  circuitGroups: any;
  status: IDetail & { percent: number };
  time: Date;
  valve: number;
  body: number;
  freeze: boolean;
}
export interface IConfig {
  lastUpdated: string;
  controllerType: "intellicenter" | "intellitouch" | "intellicom" | "none";
  pool: IConfigPoolOptions;
  bodies: IConfigBody[];
  schedules: IConfigSchedule[];
  eggTimers?: IConfigEggTimer[];
  customNames?: IConfigCustomName[];
  equipment: IConfigEquipment;
  valves: IConfigValve[];
  circuits: IConfigCircuit[];
  features: IConfigFeature[];
  pumps: IConfigPump[];
  chlorinators: IConfigChlorinator[];
  remotes: IConfigRemote[];
  intellibrite?: IConfigIntellibrite[];
  heaters: any[];
  appVersion: string;
}
export interface IStateCircuit {
  id: number;
  isOn: boolean;
  name: string;
  type?: IDetail;
  lightingTheme?: IDetail;
}
export interface IStateChlorinator {
  id: number;
  lastComm: number;
  currentOutput: number;
  saltLevel: number;
  saltRequired: number;
  status: IDetail;
  poolSetpoint: number;
  spaSetpoint: number;
  superChlor: boolean;
  superChlorHours: number;
  targetOutput: number;
  name: string;
  body: number;
}
export interface IStateSchedule {
  id: number;
  circuit: number;
  startTime: number;
  endTime: number;
  scheduleType: IDetail;
  scheduleDays: {
    val: number;
    days: (IDetail & { dow: number })[];
  };
}
export interface IStatePoolPump {
  command: number;
  driveState: number;
  flow?: number;
  id: number;
  mode: number;
  ppc: number;
  rpm?: number;
  runTime: number;
  status: IDetail;
  type: IDetail;
  watts: number;
}
export interface IStatePoolTemp {
  air: number;
  bodies: IStateTempBodyDetail[];
  solar: number;
  units: IDetail;
  waterSensor1: number;
  waterSensor2: number;
}
export interface IStateTempBodyDetail {
  circuit: number;
  heatMode: IDetail;
  heatStatus: IDetail;
  id: number;
  isOn: boolean;
  name: string;
  setPoint: number;
  temp: number;
}
export interface IConfigController {
  adjustDST: boolean;
  batteryVoltage?: number;
  body: number;
  delay: number;
  freeze: boolean;
  heatMode: number;
  mode: IDetail;
  status: IDetail & { percent?: number };
  time: Date;
  valve: number;
}
export interface IDetail {
  val: number;
  name: string;
  desc: string;
}
export interface IConfigPoolOptions {
  options: {
    adjustDST: boolean;
    clockMode: number;
    clockSource: "internet" | "manual";
    pumpDelay: boolean;
    manualHeat: boolean;
  };
}
export interface IConfigBody {
  id: number;
  name: string;
  isActive: boolean;
  heatMode: number;
  setPoint: number;
}
export interface IConfigSchedule {
  id: number;
  circuit: number;
  startTime: number;
  endTime: number;
  isActive: boolean;
  scheduleDays: number;
}
export interface IConfigEggTimer {
  id: number;
  circuit: number;
  runTime: number;
  isActive: boolean;
}
export interface IConfigCustomName {
  id: number;
  name: string;
  isActive: boolean;
}
export interface IConfigEquipment {
  model: string;
  shared: boolean;
  maxCircuits: number;
  maxBodies: number;
  maxFeatures: number;
  maxIntelliBrites: number;
  maxSchedules: number;
  bootloaderVersion?: string;
  softwareVersion?: string;
  highSpeedCircuits?: IConfigHighSpeedCircuit[];
}
export interface IConfigHighSpeedCircuit {
  id: number;
  type: number;
  isActive: boolean;
}
export interface IConfigValve {
  id: number;
  circuit: number;
  isActive: boolean;
  name: string;
}
export interface IConfigCircuit {
  id: number;
  type: number;
  name: string;
  freeze: boolean;
  macro: boolean;
  isActive: boolean;
}
export interface IConfigFeature {
  id: number;
  type: number;
  name: string;
  freeze: boolean;
  macro: boolean;
  isActive: boolean;
}
export interface IConfigPump {
  id: number;
  type: number;
  primingSpeed?: number;
  primingTime?: number;
  minSpeed: number;
  maxSpeed: number;
  speedStepSize: number;
  isActive: boolean;
  circuits: IConfigPumpCircuit[];
}
export interface IConfigPumpCircuit {
  id: number;
  circuit: number;
  speed?: number;
  flow?: number;
  units: 0 | 1;
}
export interface IConfigChlorinator {
  id: number;
  isActive: boolean;
  body: number;
  spaSetpoint: number;
  poolSetpoint: number;
  superChlor: boolean;
  superChlorHours: number;
  name: string;
}
export interface IConfigRemote {
  id: number;
  type: number;
  isActive: boolean;
  name: string;
  button1: number;
  button2: number;
  button3: number;
  button4: number;
  button5?: number;
  button6?: number;
  button7?: number;
  button8?: number;
  button9?: number;
  button10?: number;
  pumpId?: number;
  stepSize?: number;
}
export interface IConfigIntellibrite {
  id: number;
  isActive: number;
  position: number;
  colorSet: number;
  swimDelay: number;
}
export function getItemById(data: any, _id: number) {
  if (Array.isArray(data)) {
    let res = data.find(el => el.id === _id);
    if (typeof res === "undefined") {
      return 0;
    } else {
      return res;
    }
  }
}
export function getItemByIndex(data: any, ndx: number) {
  return data[ndx + 1].shift();
}

export function getItemByAttr(data: any, attr: string, val: any) {
  return data.filter(el => el[attr] === val).shift();
}

class PoolController extends React.Component<any, IPoolSystem> {
  constructor(props: IPoolSystem) {
    super(props);
    this.state = {
      counter: 0,
      _config: {
        controllerType: "none",
        lastUpdated: "",
        pool: {
          options: {
            adjustDST: false,
            clockMode: 12,
            clockSource: "manual",
            pumpDelay: false,
            manualHeat: false
          }
        },
        bodies: [],
        schedules: [],
        eggTimers: [],
        customNames: [],
        equipment: {
          model: "",
          shared: false,
          maxCircuits: 0,
          maxBodies: 0,
          maxFeatures: 0,
          maxIntelliBrites: 0,
          maxSchedules: 0
        },
        valves: [],
        circuits: [],
        features: [],
        pumps: [],
        chlorinators: [
          {
            name: "none",
            id: 1,
            isActive: false,
            body: 0,
            spaSetpoint: 0,
            poolSetpoint: 0,
            superChlorHours: 0,
            superChlor: false
          }
        ],
        remotes: [],
        intellibrite: [],
        heaters: [],
        appVersion: "0.0.0"
      },
      _state: {
        temps: {
          air: 0,
          solar: 0,
          bodies: [],
          units: { val: 0, name: "", desc: "" },
          waterSensor1: 0,
          waterSensor2: 0
        },
        pumps: [
          {
            id: 1,
            type: { desc: "None", val: 0, name: "none" },
            status: { desc: "None", val: 0, name: "none" },
            command: 0,
            driveState: 0,
            mode: 0,
            ppc: 0,
            runTime: 0,
            watts: 0
          }
        ],
        mode: { val: 0, name: "", desc: "" },
        status: {
          val: 254,
          name: "not_loaded",
          desc: "Not Loaded",
          percent: 0
        },
        equipment: {},
        valves: [],
        heaters: [],
        circuits: [],
        circuitGroups: [],
        features: [],
        chlorinators: [
          {
            id: 1,
            spaSetpoint: 0,
            poolSetpoint: 0,
            superChlorHours: 0,
            superChlor: false,
            currentOutput: 0,
            lastComm: 0,
            saltLevel: 0,
            saltRequired: 0,
            status: { val: 0, desc: "", name: "" },
            targetOutput: 0,
            name: "",
            body: 32
          }
        ],
        schedules: [],
        time: new Date(),
        valve: 0,
        body: 0,
        freeze: false
      }
    };

    let a: IPoolSystem;
    let lastUpdateTime = 0;
  }

  componentDidMount() {
    fetch("/state/all")
      .then(res => res.json())
      .then(
        result => {
          this.setState(state => {
            return extend(true, state, { _state: result });
          });
        },
        error => {
          console.log(error);
        }
      );
    fetch("/config/all")
      .then(res => res.json())
      .then(
        result => {
          this.setState(state => {
            return extend(true, state, { _config: result });
          });
        },
        error => {
          console.log(error);
        }
      );

    incoming((d: any, which: string) => {
      console.log({ [which]: d });
      switch (which) {
        case "error":
        case "connect":
          this.setState(state => {
            return extend(true, state, { _state: d });
          });
          break;
        case "controller":
          this.setState(state => {
            return extend(
              true,
              state,
              { _state: d },
              { counter: state.counter + 1 }
            );
          });
          break;
        case "pump":
          this.setState(state => {
            let pumps = extend(true, [], state._state.pumps);
            let index = state._state.pumps.findIndex(el => {
              return el.id === d.id;
            });
            pumps[index] = d;
            return extend(
              true,
              state,
              { _state: { pumps: pumps } },
              { counter: state.counter + 1 }
            );
          });
          break;
        case "chlorinator":
          this.setState(state => {
            let chlors = extend(true, [], state._state.chlorinators);
            let index = state._state.chlorinators.findIndex(el => {
              return el.id === d.id;
            });
            chlors[index] = d;
            return extend(
              true,
              state,
              { _state: { chlorinators: chlors } },
              { counter: state.counter + 1 }
            );
          });
          break;
        case "temps":
          this.setState(state => {
            return extend(
              true,
              state,
              { _state: { temps: d } },
              { counter: state.counter + 1 }
            );
          });
          break;
        case "config":
          this.setState(state => {
            return extend(
              true,
              state,
              { _config: d },
              { counter: state.counter + 1 }
            );
          });
          break;
        // case 'pumps':
        //         this.setState( state =>
        //         {
        //             return extend( true, state, { _state: {pumps: d} }, { counter: state.counter + 1 } );
        //         } )
        //         break;
        case "feature":
          this.setState(state => {
            let features = extend(true, [], state._state.features);
            let index = state._state.features.findIndex(el => {
              return el.id === d.id;
            });
            features[index] = d;
            return extend(
              true,
              state,
              { _state: { features: features } },
              { counter: state.counter + 1 }
            );
          });
          break;
        case "circuit":
          this.setState(state => {
            let circuits = extend(true, [], state._state.circuits);
            let index = state._state.circuits.findIndex(el => {
              return el.id === d.id;
            });
            circuits[index] = d;
            return extend(
              true,
              state,
              { _state: { circuits: circuits } },
              { counter: state.counter + 1 }
            );
          });
          break;
        default:
          console.log(`incoming socket ${which} not processed`);
          console.log(d);
      }
    });
  }
  condensedCircuitFeatureList() {
    let special = [];
    if (this.state._config.controllerType === "intellitouch") {
      special.push(
        { id: 0, name: "None", type: "special" },
        { id: 128, name: "Solar", type: "special" },
        { id: 129, name: "Either Heater", type: "special" },
        { id: 130, name: "Pool Heater", type: "special" },
        { id: 131, name: "Spa Heater", type: "special" },
        { id: 132, name: "Freeze", type: "special" }
      );
    }
    let condensedF = this.state._state.features.map(el => {
      return { id: el.id, name: el.name, type: "feature" };
    });
    let condensedC = this.state._state.circuits.map(el => {
      return { id: el.id, name: el.name, type: "circuit" };
    });
    return condensedC.concat(condensedF, special);
  }
  idOfFirstUnusedSchedule() {
    if (this.state._config.controllerType === "intellitouch") {
      // easytouch/intellitouch will grab the next available schedules.
      // since we are splitting up eggtimers/schedules we need to take a holistic look so we don't overwrite an existing schedule with a new one
      for (let i = 1; i <= this.state._config.equipment.maxSchedules; i++) {
        let occupiedSlot =
          this.state._state.schedules.filter(el => el.id === i).length ||
          this.state._config.eggTimers.filter(el => el.id === i).length;
        if (!occupiedSlot) return i;
      }
    } else if (this.state._config.controllerType === "intellicenter") {
      // how to determine first unused?
    }
  }
  render() {
    return (
      <div>
        <Navbar status={this.state._state.status} counter={this.state.counter}>
          {this.state._state.status.percent}
        </Navbar>
        <Container>
          <SysInfo
            dateTime={this.state._state.time}
            status={this.state._state.status}
            mode={this.state._state.mode}
            freeze={this.state._state.freeze}
            counter={this.state.counter}
            model={this.state._state.equipment.model}
            airTemp={this.state._state.temps.air}
            solarTemp={this.state._state.temps.solar}
            id="system"
            visibility={"visible"}
          />
          <BodyState
            data={this.state._state.temps.bodies}
            UOM={this.state._state.temps.units}
            id="bodies"
            visibility={"visible"}
          />
          <Pump
            pumpState={this.state._state.pumps}
            pumpConfig={this.state._config.pumps}
            id="pumps"
            visibility={"visible"}
            condensedCircuitsAndFeatures={this.condensedCircuitFeatureList()}
          />
          <Circuits
            circuits={this.state._state.circuits}
            hideAux={false}
            id="circuits"
            visibility={"visible"}
          />
          <Circuits
            circuits={this.state._state.features}
            hideAux={false}
            id="features"
            visibility={"visible"}
          />
          <Schedule
            data={this.state._state.schedules}
            id="schedules"
            visibility={"visible"}
            idOfFirstUnusedSchedule={this.idOfFirstUnusedSchedule()}
          />
          <Chlorinator
            data={this.state._state.chlorinators}
            id="chlorinators"
            visibility={"visible"}
          />
        </Container>
      </div>
    );
  }
}

export default PoolController;