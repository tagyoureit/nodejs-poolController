import { Inbound } from "../Messages";
import { sys, Circuit, CircuitOrFeatureFactory } from "../../../Equipment";

export class CircuitMessage {
    public static process(msg: Inbound): void {

        switch (msg.action) {
            case 11: // IntelliTouch Circuits
                console.log('Here i am');
                CircuitMessage.processCircuitAttributes(msg);
                break;
            case 30: // IntelliCenter
                switch (msg.extractPayloadByte(1)) {
                    case 0: // Circuit Type
                        CircuitMessage.processCircuitTypes(msg);
                        break;
                    case 1: // Freeze
                        CircuitMessage.processFreezeProtect(msg);
                        break;
                    case 2: // Show in features
                        CircuitMessage.processShowInFeatures(msg);
                        break;
                    case 3: // Circuit Names
                    case 4:
                    case 5:
                    case 6:
                    case 7:
                    case 8:
                    case 9:
                    case 10:
                    case 11:
                    case 12:
                    case 13:
                    case 14:
                    case 15:
                    case 16:
                    case 17:
                    case 18:
                    case 19:
                    case 20:
                    case 21:
                    case 22:
                    case 23:
                    case 24:
                        CircuitMessage.processCircuitNames(msg);
                        break;
                    case 25: // Not sure what this is.
                        break;
                    case 26:
                        CircuitMessage.processLightingTheme(msg);
                        break;
                    case 27:
                        CircuitMessage.processEggTimerHours(msg);
                        break;
                    case 28:
                        CircuitMessage.processEggTimerMinutes(msg);
                        break;
                    case 29:
                        CircuitMessage.processShowInCircuits(msg);
                        break;
                }
                break;
            case 39: // IntelliTouch Light Groups
            case 167:
                CircuitMessage.processIntelliBrite(msg);
                break;
        }
    }
    private static processIntelliBrite(msg: Inbound) {
        //                        1        2             3            4           5           6           7           8
        //                        0  1 2 3 4  5  6  7   8   9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31
        // [165,16,16,34,167,32],[9,32,0,0,7,32, 0, 0, 18, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 254]
        // [165,16,15,16, 39,32],[8, 0,0,0,9, 0, 0, 0,  0,  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],[1,44]


        // [255,255,255,255,255,255,255,0,255,165,1,15,16,39,25,2,255,129,45,127,215,235,250,203,251,249,128]


        /* IntelliTouch does NOT notify the controllers when something is deleted.
                Thus, we must keep track of all current items and delete/re-init them every time.
                The IntelliBrite Collection does that and we will wipe clean all IntelliBrite/Circuit relationships and re-establish each time the packet(s) are resent.  */

        let index = 1; // which intellibrite position are we updating?
        let byte = 0; // which byte are we starting with?
        if (msg.datalen === 25) {
            // increase intellibrite max if necessary
            if (sys.equipment.maxIntelliBrites <= msg.extractPayloadByte(0) * 4) sys.equipment.maxIntelliBrites = msg.extractPayloadByte(0) * 4;
            index = msg.extractPayloadByte(0) * 4 - 3;
            byte = 1; // start iterating after the byte that tells us which ib packet # this is
        }
        else if (msg.datalen === 32)
            if (sys.equipment.maxIntelliBrites !== 8) sys.equipment.maxIntelliBrites = 8;

        if (index === 1 && msg.datalen === 25 || msg.datalen === 32)
            // if this is the first (or only) packet, reset all IB to active=false and re-verify they are still there with incoming packets
            for (let i = 0; i < sys.intellibrite.circuits.length; i++)
                sys.intellibrite.circuits.getItemByIndex(i).isActive = false;

        const intellibriteCollection = sys.intellibrite;
        for (byte; byte <= msg.datalen; byte = byte + 4) {
            const circuit = msg.extractPayloadByte(byte);
            if (circuit > 0) {
                const intellibrite = intellibriteCollection.circuits.getItemById(circuit, true);
                intellibrite.isActive = circuit > 0 && msg.extractPayloadByte(byte + 1) > 0;
                if (intellibrite.isActive) {
                    intellibrite.circuit = circuit
                    intellibrite.position = (msg.extractPayloadByte(byte + 1) >> 4) + 1;
                    intellibrite.color = msg.extractPayloadByte(byte + 1) & 15;
                    intellibrite.swimDelay = msg.extractPayloadByte(byte + 2) >> 1;
                    intellibrite.isActive = true;
                }
            }
            index++;
        }
        // Don't set this on the circuits.  It is an attribute of the grouping.
        //for (let ib = 0; ib < sys.intellibrite.circuits.length; ib++) {
        //    const intellibrite = sys.intellibrite.circuits.getItemByIndex(ib);
        //    if (intellibrite.isActive === false) continue;
        //    const circ = sys.circuits.getItemById(intellibrite.id);
        //    circ.intellibrite.colorSet = intellibrite.colorSet;
        //    circ.intellibrite.swimDelay = intellibrite.swimDelay;
        //    circ.intellibrite.position = intellibrite.position;
        //}
    }
    private static processCircuitTypes(msg: Inbound) {
        for (let i = 1; i < msg.payload.length - 1 && i <= sys.equipment.maxCircuits; i++) {
            const circuit: Circuit = sys.circuits.getItemById(i, i <= sys.equipment.maxCircuits);
            // For some odd reason the circuit type for circuit 6 does not equal pool while circuit 1 does equal spa.
            circuit.type = i !== 6 ? msg.extractPayloadByte(i + 1) : 12;
            if (circuit.isActive && i > sys.equipment.maxCircuits) sys.circuits.removeItemById(circuit.id);
            circuit.isActive = i <= sys.equipment.maxCircuits;
        }
    }
    private static processFreezeProtect(msg: Inbound) {
        for (let i = 1; i < msg.payload.length && i <= sys.equipment.maxCircuits; i++) {
            const circuit: Circuit = sys.circuits.getItemById(i, true);
            circuit.freeze = msg.extractPayloadByte(i + 1) > 0;
        }
    }
    private static processShowInFeatures(msg: Inbound) {
        for (let i = 1; i < msg.payload.length && i <= sys.equipment.maxCircuits; i++) {
            const circuit: Circuit = sys.circuits.getItemById(i, true);
            circuit.showInFeatures = msg.extractPayloadByte(i + 1) > 0;
        }
    }
    private static processCircuitNames(msg: Inbound) {
        let circuitId = (msg.extractPayloadByte(1) - 3) * 2 + 1;
        if (circuitId <= sys.equipment.maxCircuits) sys.circuits.getItemById(circuitId++, true).name = msg.extractPayloadString(2, 16);
        if (circuitId <= sys.equipment.maxCircuits) sys.circuits.getItemById(circuitId++, true).name = msg.extractPayloadString(18, 16);
    }
    private static processLightingTheme(msg: Inbound) {
        for (let i = 1; i < msg.payload.length && i <= sys.equipment.maxCircuits; i++) {
            const circuit: Circuit = sys.circuits.getItemById(i, true);
            circuit.lightingTheme = msg.extractPayloadByte(i + 1);
        }
    }
    private static processEggTimerHours(msg: Inbound) {
        for (let i = 1; i < msg.payload.length && i <= sys.equipment.maxCircuits; i++) {
            const circuit: Circuit = sys.circuits.getItemById(i, true);
            circuit.eggTimer = msg.extractPayloadByte(i + 1) * 60 + (circuit.eggTimer || 0) % 60;
        }
    }
    private static processEggTimerMinutes(msg: Inbound) {
        for (let i = 1; i < msg.payload.length && i <= sys.equipment.maxCircuits; i++) {
            const circuit: Circuit = sys.circuits.getItemById(i, true);
            circuit.eggTimer = Math.floor(circuit.eggTimer / 60) * 60 + msg.extractPayloadByte(i + 1);
        }
    }
    private static processShowInCircuits(msg: Inbound) {
        for (let i = 1; i < msg.payload.length && i <= sys.equipment.maxCircuits; i++) {
            const circuit: Circuit = sys.circuits.getItemById(i, true);
            circuit.showInCircuits = msg.extractPayloadByte(i + 1) > 0;
        }
    }

    // Intellitouch
    private static processCircuitAttributes(msg: Inbound) {
        // Sample packet
        // [255, 0, 255], [165, 33, 15, 16, 11, 5], [1, 1, 72, 0, 0], [1, 63]
        const id = msg.extractPayloadByte(0);
        const functionId = msg.extractPayloadByte(1);
        const nameId = msg.extractPayloadByte(2);
        // need better logic here for units with expansions.
        const CF = new CircuitOrFeatureFactory();
        const circuit = CF.getItemById(id, true);
        circuit.type = functionId & 63;
        circuit.name = sys.board.circuits.getNameById(nameId)
        circuit.freeze = (functionId & 64) === 64;
        circuit.macro = (functionId & 128) === 128;
        circuit.isActive = functionId !== 19 && nameId !== 0; // "not used"
        if (id <= 8) // Circuits
        {
            sys.equipment.maxCircuits = 8; // todo: move this to configuration
            if (circuit.type === 0) return; // do not process if type doesn't exist
            switch (msg.extractPayloadByte(0)) {
                case 6: // pool
                    var body = sys.bodies.getItemById(1, sys.equipment.maxBodies > 0);
                    body.name = "Pool";
                    functionId === 0 ? body.isActive = false : body.isActive = true;
                    break;
                case 1: // spa
                    body = sys.bodies.getItemById(2, sys.equipment.maxBodies > 1);
                    body.name = "Spa";
                    if (functionId === 0) {
                        // process bodies - there might be a better place to do this but without other comparison packets from pools with expansion packs it is hard to determine
                        // hack to determine equipment by circuits (for now) because IntelliCenter will tell us but we need to determine it programatically for IT.
                        sys.equipment.maxBodies = 1;
                        body.isActive = false;
                    }
                    else {
                        sys.equipment.maxBodies = 2;
                        body.isActive = true;
                    }
                    break;
            }
        }
        else // features

            sys.equipment.maxFeatures = 12; // todo: move this to configuration

    }


}
