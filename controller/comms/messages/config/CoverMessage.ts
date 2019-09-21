import { Inbound } from '../Messages';
import { sys, Cover } from '../../../Equipment';
export class CoverMessage {
  public static process(msg: Inbound): void {
    let cover: Cover;
    switch (msg.extractPayloadByte(1)) {
      case 0: // Cover Type
      case 1:
        cover = sys.covers.getItemById(msg.extractPayloadByte(1) + 1, true);
        cover.name = msg.extractPayloadString(2, 16);
        cover.circuits.length = 0;
        cover.body = msg.extractPayloadByte(1) === 0 ? 0 : 1;
        cover.isActive = (msg.extractPayloadByte(28) & 4) === 4;
        cover.normallyOn = (msg.extractPayloadByte(28) & 2) === 2;
        for (let i = 1; i < 10; i++)
          if (msg.extractPayloadByte(i + 18) !== 255) cover.circuits.push(msg.extractPayloadByte(i + 18));
        break;
    }
  }
}
