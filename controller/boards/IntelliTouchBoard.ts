/*  nodejs-poolController.  An application to control pool equipment.
Copyright (C) 2016, 2017.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com

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
import {SystemBoard, byteValueMap, ConfigQueue, ConfigRequest, BodyCommands, PumpCommands, SystemCommands, CircuitCommands, FeatureCommands, ChlorinatorCommands, EquipmentIdRange} from './SystemBoard';
import {logger} from '../../logger/Logger';
import { EasyTouchBoard, TouchConfigQueue, GetTouchConfigCategories } from './EasyTouchBoard';
import {state, ChlorinatorState} from '../State';
import { PoolSystem, Body, Pump, sys, CircuitGroupCircuit, CircuitGroup } from '../Equipment';
import { Protocol, Outbound, Message, Response } from '../comms/messages/Messages';

import {conn} from '../comms/Comms';
export class IntelliTouchBoard extends EasyTouchBoard {
    constructor (system: PoolSystem){
        super(system);
        this.equipmentIds.features.start = 41;
        this.equipmentIds.features.end = 50;
        this._configQueue = new ITTouchConfigQueue();
    }
}
class ITTouchConfigQueue extends TouchConfigQueue {
    public queueChanges() {
        this.reset();
        if (conn.mockPort) {
            logger.info(`Skipping configuration request from OCP because MockPort enabled.`);
        } else {
            logger.info(`Requesting ${sys.controllerType} configuration`);
            this.queueItems(GetTouchConfigCategories.dateTime, [0]);
            this.queueItems(GetTouchConfigCategories.heatTemperature, [0]);
            this.queueItems(GetTouchConfigCategories.solarHeatPump, [0]);
            this.queueRange(GetTouchConfigCategories.customNames, 0, sys.equipment.maxCustomNames - 1);
            this.queueRange(GetTouchConfigCategories.circuits, 1, sys.equipment.maxCircuits); // circuits
            this.queueRange(GetTouchConfigCategories.circuits, 41, 41 + sys.equipment.maxFeatures); // features
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
            this.queueRange(GetTouchConfigCategories.circuitGroups, 0, sys.equipment.maxFeatures - 1);
            // items not required by ScreenLogic
            if (sys.chlorinators.getItemById(1).isActive)
                this.queueItems(GetTouchConfigCategories.intellichlor, [0]);
        }
        if (this.remainingItems > 0) {
            var self = this;
            setTimeout(() => {self.processNext();}, 50);
        } else state.status = 1;
        state.emitControllerChange();
    }
}