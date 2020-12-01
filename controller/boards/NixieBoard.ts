/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017, 2018, 2019, 2020.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com

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
import * as extend from 'extend';
import { EventEmitter } from 'events';
import { ncp } from "../nixie/Nixie";
import {SystemBoard, byteValueMap, ConfigQueue, ConfigRequest, BodyCommands, PumpCommands, SystemCommands, CircuitCommands, FeatureCommands, ChlorinatorCommands, ChemControllerCommands, EquipmentIdRange} from './SystemBoard';
import { logger } from '../../logger/Logger';
import { state, ChlorinatorState, ChemControllerState } from '../State';
import { sys, PoolSystem, Body, Pump, CircuitGroupCircuit, CircuitGroup, ChemController } from '../Equipment';
import { Protocol, Outbound, Message, Response } from '../comms/messages/Messages';
import {conn} from '../comms/Comms';
export class NixieBoard extends SystemBoard {
    constructor (system: PoolSystem){
        super(system);
    }
}
export class NixieChemControllerCommands extends ChemControllerCommands {
    protected async setIntelliChemAsync(data: any): Promise<ChemController> {
        try {
            let chem = await super.setIntelliChemAsync(data);
            // Now Nixie needs to make sure we are polling IntelliChem
            return Promise.resolve(chem);
        }
        catch (err) { return Promise.reject(err); }
    }
    protected async setIntelliChemStateAsync(data: any): Promise<ChemControllerState> {
        try {
            let schem = await super.setIntelliChemStateAsync(data);
            return Promise.resolve(schem);
        }
        catch (err) { return Promise.reject(err); }
    }
}
