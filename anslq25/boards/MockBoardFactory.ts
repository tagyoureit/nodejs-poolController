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
// import { MockIntelliCenterBoard } from './MockIntelliCenterBoard';
// import { MockIntelliTouchBoard } from './MockIntelliTouchBoard';
// import { MockIntelliComBoard } from './MockIntelliComBoard';
import { MockEasyTouch } from './MockEasyTouchBoard';
import { MockSystemBoard } from './MockSystemBoard';
import { ControllerType } from '../../controller/Constants';
import { PoolSystem } from 'controller/Equipment';
// import { MockAquaLinkBoard } from './MockAquaLinkBoard';
// import { MockSunTouchBoard } from "./MockSunTouchBoard";


export class MockBoardFactory {
    // Factory create the system board from the controller type.  Resist storing
    // the pool system as this can cause a leak.  The PoolSystem object already has a reference to this.
    public static fromControllerType(ct: ControllerType, system: PoolSystem) {
        switch (ct) {
            // case ControllerType.IntelliCenter:
            //     return new MockIntelliCenterBoard(system);
            // case ControllerType.IntelliTouch:
            //     return new MockIntelliTouchBoard(system);
            // case ControllerType.IntelliCom:
            //     return new MockIntelliComBoard(system);
            case ControllerType.EasyTouch:
                return new MockEasyTouch(system);
            // case ControllerType.AquaLink:
            //     return new MockAquaLinkBoard(system);
            // case ControllerType.SunTouch:
            //     return new MockSunTouchBoard(system);
        }
        return new MockSystemBoard(system);
    }

}