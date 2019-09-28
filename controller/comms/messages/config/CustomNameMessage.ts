import { Inbound } from "../Messages";
import { sys } from "../../../Equipment";
export class CustomNameMessage
{
    public static process ( msg: Inbound ): void
    {
        let customNameId = msg.extractPayloadByte( 0 );
        let customName = sys.customNames.getItemById( customNameId, customNameId <= sys.equipment.maxCustomNames );
        customName.name = msg.extractPayloadString( 1, 11 );
        // customName.isActive = customNameId <= sys.equipment.maxCustomNames && !customName.name.includes('USERNAME-')
        if ( customNameId >= sys.equipment.maxCustomNames ) sys.equipment.maxCustomNames = customNameId + 1;
    }
}