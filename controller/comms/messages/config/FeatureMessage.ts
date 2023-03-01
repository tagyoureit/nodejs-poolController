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
import { Inbound } from "../Messages";
import { sys, Feature } from "../../../Equipment";
import { state, FeatureState } from "../../../State";
import { logger } from "../../../../logger/Logger";
export class FeatureMessage {
    public static process(msg: Inbound): void {
        switch (msg.extractPayloadByte(1)) {
            case 0: // Feature Type
                FeatureMessage.processFeatureType(msg);
                break;
            case 1: // Freeze
                FeatureMessage.processFreezeProtect(msg);
                break;
            case 2: // Show in features
                FeatureMessage.processShowInFeatures(msg);
                break;
            case 3:
                FeatureMessage.processEggTimerHours(msg);
                break;
            case 4:
                FeatureMessage.processEggTimerMinutes(msg);
                break;
            case 5:
                FeatureMessage.processDontStop(msg); // Don't Stop
                break;
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
                FeatureMessage.processFeatureNames(msg);
                break;
            case 22: // Not sure what this is.
                msg.isProcessed = true;
                break;
            default:
                logger.debug(`Unprocessed Config Message ${msg.toPacket()}`)
                break;
        }
    }
    private static processDontStop(msg: Inbound) {
        for (let i = 1; i < msg.payload.length - 1 && i <= sys.equipment.maxFeatures; i++) {
            let featureId = i + sys.board.equipmentIds.features.start - 1;
            var feature: Feature = sys.features.getItemById(featureId, false);
            feature.dontStop = msg.extractPayloadByte(i + 1) == 1;
        }
        msg.isProcessed = true;
    }
    private static processFeatureType(msg: Inbound) {
        for (let i = 1; i < msg.payload.length - 1 && i <= sys.equipment.maxFeatures; i++) {
            let featureId = i + sys.board.equipmentIds.features.start - 1;
            let type = msg.extractPayloadByte(i + 1);
            let feature: Feature = sys.features.getItemById(featureId, type !== 255);
            let sFeature: FeatureState = state.features.getItemById(featureId, type !== 255);
            if (type !== 255) {
                let feature: Feature = sys.features.getItemById(featureId);
                feature.isActive = true;
                sFeature.type = feature.type = type;
            }
            else {
                feature.isActive = false;
                sys.features.removeItemById(featureId);
                state.features.removeItemById(featureId);
            }
        }
        msg.isProcessed = true;
    }
    private static processFreezeProtect(msg: Inbound) {
        for (let i = 1; i < msg.payload.length - 1 && i <= sys.equipment.maxFeatures; i++) {
            let featureId = i + sys.board.equipmentIds.features.start - 1;
            var feature: Feature = sys.features.getItemById(featureId);
            feature.freeze = msg.extractPayloadByte(i + 1) > 0;
        }
        msg.isProcessed = true;
    }
    private static processFeatureNames(msg: Inbound) {
        var featureId = ((msg.extractPayloadByte(1) - 6) * 2) + sys.board.equipmentIds.features.start;
        if (sys.board.equipmentIds.features.isInRange(featureId)) {
            let feature: Feature = sys.features.getItemById(featureId++);
            feature.name = msg.extractPayloadString(2, 16);
            if (feature.isActive) state.features.getItemById(feature.id).name = feature.name;
        }
        if (sys.board.equipmentIds.features.isInRange(featureId)) {
            let feature: Feature = sys.features.getItemById(featureId++);
            feature.name = msg.extractPayloadString(18, 16);
            if (feature.isActive) state.features.getItemById(feature.id).name = feature.name;
        }
        state.emitEquipmentChanges();
        msg.isProcessed = true;
    }
    private static processEggTimerHours(msg: Inbound) {
        for (let i = 1; i < msg.payload.length - 1 && i <= sys.equipment.maxFeatures; i++) {
            let featureId = i + sys.board.equipmentIds.features.start - 1;
            let feature: Feature = sys.features.getItemById(featureId);
            feature.eggTimer = (msg.extractPayloadByte(i + 1) * 60) + ((feature.eggTimer || 0) % 60);
        }
        msg.isProcessed = true;
    }
    private static processEggTimerMinutes(msg: Inbound) {
        for (let i = 1; i < msg.payload.length - 1 && i <= sys.equipment.maxFeatures; i++) {
            let featureId = i + sys.board.equipmentIds.features.start - 1;
            var feature: Feature = sys.features.getItemById(featureId);
            feature.eggTimer = (Math.floor(feature.eggTimer / 60) * 60) + msg.extractPayloadByte(i + 1);
        }
        msg.isProcessed = true;
    }
    private static processShowInFeatures(msg: Inbound) {
        for (let i = 1; i < msg.payload.length - 1 && i <= sys.equipment.maxFeatures; i++) {
            let featureId = i + sys.board.equipmentIds.features.start - 1;
            var feature: Feature = sys.features.getItemById(featureId);
            feature.showInFeatures = msg.extractPayloadByte(i + 1) > 0;
            if (feature.isActive) state.features.getItemById(featureId, feature.isActive).showInFeatures = feature.showInFeatures;
        }
        state.emitEquipmentChanges();
        msg.isProcessed = true;
    }
}