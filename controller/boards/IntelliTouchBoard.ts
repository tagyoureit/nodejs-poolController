import * as extend from 'extend';
import { EventEmitter } from 'events';
import {SystemBoard, byteValueMap, ConfigQueue, ConfigRequest, BodyCommands, PumpCommands, SystemCommands, CircuitCommands, FeatureCommands, ChemistryCommands} from './SystemBoard';
import { EasyTouchBoard } from './EasyTouchBoard';
import {state, ChlorinatorState} from '../State';
import {PoolSystem, Body, Pump, sys} from '../Equipment';
export class IntelliTouchBoard extends EasyTouchBoard {
    constructor (system: PoolSystem){
        super(system);
    }
    public circuits: TouchCircuitCommands=new TouchCircuitCommands(this);
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