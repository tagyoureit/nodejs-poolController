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
import * as extend from 'extend';
import { EventEmitter } from 'events';
import { EasyTouchBoard } from './EasyTouchBoard';
import { sys, PoolSystem } from '../Equipment';
import { byteValueMap } from './SystemBoard';
import { state } from '../State';

export class IntelliComBoard extends EasyTouchBoard {
    constructor(system: PoolSystem) {
        super(system); // graph chain to EasyTouchBoard constructor.
        this.valueMaps.expansionBoards = new byteValueMap([
            [11, { name: 'INTCOM2', part: 'INTCOM2', desc: 'IntelliComm II', circuits: 6, shared: true }]
        ]);
    }
    public initExpansionModules(byte1: number, byte2: number) {
        switch (byte1) {
            case 40: // This is a SunTouch
                break;
        }
        console.log(`Pentair IntelliCom System Detected!`);

        sys.equipment.model = 'Suntouch/Intellicom';

        // Initialize the installed personality board.
        let mt = this.valueMaps.expansionBoards.transform(0);
        let mod = sys.equipment.modules.getItemById(0, true);
        mod.name = mt.name;
        mod.desc = mt.desc;
        mod.type = byte1;
        mod.part = mt.part;
        let eq = sys.equipment;
        let md = mod.get();
        eq.maxBodies = md.bodies = typeof mt.bodies !== 'undefined' ? mt.bodies : mt.shared ? 2 : 1;
        eq.maxCircuits = md.circuits = typeof mt.circuits !== 'undefined' ? mt.circuits : 4;
        eq.maxFeatures = md.features = typeof mt.features !== 'undefined' ? mt.features : 0
        eq.maxValves = md.valves = typeof mt.valves !== 'undefined' ? mt.valves : 2;
        eq.maxPumps = md.maxPumps = typeof mt.pumps !== 'undefined' ? mt.pumps : 2;
        eq.shared = mt.shared;
        eq.dual = false;
        eq.single = true;
        eq.maxChlorinators = md.chlorinators = 1;
        eq.maxChemControllers = md.chemControllers = 1;
        eq.maxCustomNames = 10;
        // Calculate out the invalid ids.
        sys.board.equipmentIds.invalidIds.set([]);
        sys.board.equipmentIds.invalidIds.merge([5, 7, 8, 9, 13, 14, 15, 16, 17, 18])
        sys.equipment.model = mt.desc;
        this.initBodyDefaults();
        state.emitControllerChange();
    }

}
