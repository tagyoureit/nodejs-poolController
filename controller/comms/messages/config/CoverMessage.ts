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
import { Inbound } from '../Messages';
import { sys, Cover } from '../../../Equipment';
import { logger } from "../../../../logger/Logger";
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
              for (let i = 1; i < 10; i++) {
                  if (msg.extractPayloadByte(i + 18) !== 255) cover.circuits.push(msg.extractPayloadByte(i + 18));
              }
              msg.isProcessed = true;
              break;
          default:
              logger.debug(`Unprocessed Config Message ${msg.toPacket()}`)
              break;

      }
  }
}
