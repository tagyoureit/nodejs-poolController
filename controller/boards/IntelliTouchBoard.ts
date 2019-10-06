import * as extend from 'extend';
import { EventEmitter } from 'events';
import {SystemBoard, byteValueMap, ConfigQueue, ConfigRequest, BodyCommands, PumpCommands, SystemCommands, CircuitCommands, FeatureCommands, ChemistryCommands} from './SystemBoard';
import {logger} from '../../logger/Logger';
import { EasyTouchBoard, GetTouchConfigCategories } from './EasyTouchBoard';
import {state, ChlorinatorState} from '../State';
import {PoolSystem, Body, Pump, sys} from '../Equipment';
import {conn} from '../comms/Comms';
export class IntelliTouchBoard extends EasyTouchBoard {
    constructor (system: PoolSystem){
        super(system);
        this.equipmentIds.features.start = 40;
    }
    public circuits: TouchCircuitCommands=new TouchCircuitCommands(this);

}
class TouchConfigQueue extends ConfigQueue {
    public queueChanges() {
        this.reset();
        if (conn.mockPort) {
            logger.info(`Skipping Controller Init because MockPort enabled.`);
        } else {
            logger.info(`Requesting ${sys.controllerType} configuration`);
            this.queueItems(GetTouchConfigCategories.dateTime, [0]);
            this.queueItems(GetTouchConfigCategories.heatTemperature, [0]);
            this.queueItems(GetTouchConfigCategories.solarHeatPump, [0]);
            this.queueRange(GetTouchConfigCategories.customNames, 0, sys.equipment.maxCustomNames - 1);
            this.queueRange(GetTouchConfigCategories.circuits, 1, sys.equipment.maxCircuits); // circuits
            this.queueRange(GetTouchConfigCategories.circuits, 40, sys.equipment.maxCircuits); // features/macros
            this.queueRange(GetTouchConfigCategories.schedules, 1, sys.equipment.maxSchedules);
            this.queueItems(GetTouchConfigCategories.delays, [0]);
            this.queueItems(GetTouchConfigCategories.settings, [0]);
            this.queueItems(GetTouchConfigCategories.intellifloSpaSideRemotes, [0]);
            this.queueItems(GetTouchConfigCategories.is4is10, [0]);
            this.queueItems(GetTouchConfigCategories.spaSideRemote, [0]);
            this.queueItems(GetTouchConfigCategories.valves, [0]);
            this.queueItems(GetTouchConfigCategories.lightGroupPositions);
            this.queueItems(GetTouchConfigCategories.highSpeedCircuits, [0]);
            this.queueRange(GetTouchConfigCategories.pumpConfig, 1, sys.equipment.maxPumps);
        }
        if (this.remainingItems > 0) {
            var self = this;
            setTimeout(() => {self.processNext();}, 50);
        } else state.status = 1;
        state.emitControllerChange();
    }

}
class TouchCircuitCommands extends CircuitCommands {
    public setLightGroupState(grp:number = 1, color: number){
        // IntelliTouch apparently overrides EasyTouch functionality and only circuits that are on adopt the current theme.
        // we are un-overriding as this is the IntelliCenter behavior as well
         for (let i = 0; i <= sys.intellibrite.circuits.length; i++) {
            const ib = sys.intellibrite.circuits.getItemByIndex(i);
            const cstate = state.circuits.getItemById(ib.circuit, true);
            if (cstate.isOn){
                const circuit = sys.circuits.getItemById(ib.circuit);
                cstate.lightingTheme = circuit.lightingTheme = color;
            }
         }
         sys.circuits.emitEquipmentChange();
    }
}