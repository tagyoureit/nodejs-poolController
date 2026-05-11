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
import { state } from '../../../State';
import { logger } from "../../../../logger/Logger";

// Cover cat=14 payload parser.
// Authoritative packet reference: .plan/v3.008/covers-packet-reference.md
//
// Action 30 cat=14 (29-byte payload, OCP broadcast):
//   [14, slot, name(16 @2..17), circuits(10 @18..27), flags @28]
// Action 168 cat=14 (30-byte payload, wireless/piggyback — +1 byte shift):
//   [14, sub, slot, name(16 @3..18), circuits(10 @19..28), flags @29]
//
// Flags bitfield (common to both):
//   bit 0 = IntelliChlor Active (chlor off while cover closed)
//   bit 1 = normallyOn (cover state normally Closed)
//   bit 2 = isActive   (cover enabled)
//   bit 3 = body       (set = Pool, clear = Spa)  — NOT derived from slot
//
// ISSUE-075 fixes in this file:
//   #1 Circuits loop was `i=1..9` (9 slots) — skipped byte[18]. Now 0..9 inclusive across all 10.
//   #2 IntelliChlor Active (bit 0) was unparsed — now mirrored to cover.chlorActive.
//   #3 Body was hard-coded from slot position — now read from flags bit 3 (dynamic on OCP swap).
//   #5 A168 cat=14 now also routes here (see ExternalMessage.ts case 14).
//
// Name is round-tripped read-only: OCP exposes no rename UI, so njsPC never edits the 16-byte
// name slot — see covers-packet-reference.md §4.1.
export class CoverMessage {
  public static process(msg: Inbound): void {
    // A30 cat=14: byte 0 = category (14), byte 1 = slot (0|1). The legacy code used byte[1] as
    // both "is this a cover sub-message" and the slot index. We preserve that: only slot 0/1 are
    // legitimate cover payloads.
    const slot = msg.extractPayloadByte(1);
    switch (slot) {
      case 0:
      case 1:
        CoverMessage.processCoverConfig(msg, slot, /*isA168*/ false);
        msg.isProcessed = true;
        break;
      default:
        logger.debug(`Unprocessed Config Message ${msg.toPacket()}`);
        break;
    }
  }

  // ISSUE-075 #5: Entry point used by ExternalMessage.ts case 14 to ingest A168 cat=14 frames.
  // A168 payload shape:
  //   [14, sub, slot, name(16), circuits(10), flags]
  // Same semantics as A30 but every field is shifted +1. Only sub=0 is observed on the bench.
  public static processA168(msg: Inbound): void {
    const sub = msg.extractPayloadByte(1);
    if (sub !== 0) {
      logger.debug(`Unprocessed A168 cat=14 sub=${sub} ${msg.toPacket()}`);
      return;
    }
    const slot = msg.extractPayloadByte(2);
    if (slot !== 0 && slot !== 1) {
      logger.debug(`Unprocessed A168 cat=14 slot=${slot} ${msg.toPacket()}`);
      return;
    }
    CoverMessage.processCoverConfig(msg, slot, /*isA168*/ true);
    msg.isProcessed = true;
  }

  private static processCoverConfig(msg: Inbound, slot: number, isA168: boolean): void {
    // Byte offsets for name, circuits and flags differ by +1 between A30 and A168.
    const nameOffset = isA168 ? 3 : 2;
    const circuitsOffset = isA168 ? 19 : 18;
    const flagsOffset = isA168 ? 29 : 28;

    // Slot is the stable cover identity — the name is hard-fixed by OCP as "Cover 1" / "Cover 2".
    // Slot 0 → id 1, slot 1 → id 2.
    const cover: Cover = sys.covers.getItemById(slot + 1, true);
    cover.isActive = true; // the cover row exists; individual "enabled" bit is flags bit 2 below
    cover.name = msg.extractPayloadString(nameOffset, 16);

    const flags = msg.extractPayloadByte(flagsOffset);
    cover.chlorActive = (flags & 0x01) === 0x01;
    cover.normallyOn = (flags & 0x02) === 0x02;
    cover.isActive = (flags & 0x04) === 0x04;
    // Body: bit 3 set → Spa (1), clear → Pool (0). Corrected 2026-05-10 per OCP observation.
    cover.body = (flags & 0x08) === 0x08 ? 1 : 0;

    // Circuits: up to 10 slots, 0xFF = empty. Fixed from `i=1..9` to cover all 10 bytes.
    // Wire protocol is 0-indexed (wire 0 = njsPC circuit id 1).
    cover.circuits.length = 0;
    for (let i = 0; i < 10; i++) {
      const b = msg.extractPayloadByte(i + circuitsOffset);
      if (b !== 0xFF) cover.circuits.push(b + 1);
    }

    // Rule 18: mirror to state so dashPanel doesn't lag between the ingest and the next websocket tick.
    const scover = state.covers.getItemById(cover.id, true);
    scover.name = cover.name;
    scover.isActive = cover.isActive;
    scover.body = cover.body;
    scover.normallyOn = cover.normallyOn;
    scover.chlorActive = cover.chlorActive;
    // scover.chlorOutput is supplied by ChlorinatorMessage / ExternalMessage.processChlorinator
    // (cat=7 piggyback) — don't overwrite from here.
    state.emitEquipmentChanges();
  }
}
