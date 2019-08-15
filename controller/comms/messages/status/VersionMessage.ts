import { Inbound } from "../Messages";
import { sys, ConfigVersion } from"../../../Equipment";
export class VersionMessage {
    public static process(msg: Inbound): void {
        var ver: ConfigVersion = new ConfigVersion({});
        ver.options = msg.extractPayloadInt(6);
        ver.circuits = msg.extractPayloadInt(8);
        ver.features = msg.extractPayloadInt(10);
        ver.schedules = msg.extractPayloadInt(12);
        ver.pumps = msg.extractPayloadInt(14);
        ver.remotes = msg.extractPayloadInt(16);
        ver.circuitGroups = msg.extractPayloadInt(18);
        ver.chlorinators = msg.extractPayloadInt(20);
        ver.intellichem = msg.extractPayloadInt(22);
        ver.valves = msg.extractPayloadInt(24);
        ver.heaters = msg.extractPayloadInt(26);
        ver.security = msg.extractPayloadInt(28);
        ver.general = msg.extractPayloadInt(30);
        ver.equipment = msg.extractPayloadInt(32);
        ver.covers = msg.extractPayloadInt(34);
        ver.extSchedules = msg.extractPayloadInt(36);
        sys.processVersionChanges( ver );
    }
}