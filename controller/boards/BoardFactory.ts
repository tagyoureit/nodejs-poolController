import { IntelliCenterBoard } from './IntelliCenterBoard';
import { IntelliTouchBoard } from './IntelliTouchBoard';
import { IntelliComBoard } from './IntelliComBoard';
import { EasyTouchBoard } from './EasyTouchBoard';
import { SystemBoard } from './SystemBoard';
import { ControllerType } from '../Constants';
import { PoolSystem } from '../Equipment';

export class BoardFactory {
    // Factory create the system board from the controller type.  Resist storing
    // the pool system as this can cause a leak.  The PoolSystem object already has a reference to this.
    public static fromControllerType(ct: ControllerType, system: PoolSystem) {
        console.log(ct);
        switch (ct) {
            case ControllerType.IntelliCenter:
                return new IntelliCenterBoard(system);
            case ControllerType.IntelliTouch:
                return new IntelliTouchBoard(system);
            case ControllerType.IntelliCom:
                return new IntelliComBoard(system);
            case ControllerType.EasyTouch:
                return new EasyTouchBoard(system);
        }
        return new SystemBoard(system);
    }

}
