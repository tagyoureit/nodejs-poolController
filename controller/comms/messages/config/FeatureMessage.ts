import { Inbound } from "../Messages";
import { sys, Feature } from"../../../Equipment";
export class FeatureMessage {
    public static process(msg: Inbound): void {
        switch (msg.extractPayloadByte(1)) {
            case 0: // Feature Type
                FeatureMessage.processIsActive(msg);
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
                FeatureMessage.processFeatureType(msg);
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
                break;
        }
    }
    private static processIsActive(msg: Inbound) {
        for (let i = 1; i < msg.payload.length - 1 && i <= sys.equipment.maxFeatures; i++) {
            var feature: Feature = sys.features.getItemById(i, msg.extractPayloadByte(i + 1) !== 255);
            if (feature.isActive && msg.extractPayloadByte(i + 1) === 255) sys.features.removeItemById(i);
            feature.isActive = msg.extractPayloadByte(i + 1) !== 255;
        }
    }
    private static processFeatureType(msg: Inbound) {
        for (let i = 1; i < msg.payload.length - 1 && i <= sys.equipment.maxFeatures; i++) {
            var feature: Feature = sys.features.getItemById(i);
            feature.type = msg.extractPayloadByte(i + 1);
        }
    }
    private static processFreezeProtect(msg: Inbound) {
        for (let i = 1; i < msg.payload.length - 1  && i <= sys.equipment.maxFeatures; i++) {
            var feature: Feature = sys.features.getItemById(i);
            feature.freeze = msg.extractPayloadByte(i + 1) > 0;
        }
    }
    private static processFeatureNames(msg: Inbound) {
        var featureId = ((msg.extractPayloadByte(1) - 6) * 2) + 1;
        if (featureId <= sys.equipment.maxFeatures) sys.features.getItemById(featureId++).name = msg.extractPayloadString(2, 16);
        if (featureId <= sys.equipment.maxFeatures) sys.features.getItemById(featureId++).name = msg.extractPayloadString(18, 16);
    }
    private static processEggTimerHours(msg: Inbound) {
        for (let i = 1; i < msg.payload.length - 1 && i <= sys.equipment.maxFeatures; i++) {
            var feature: Feature = sys.features.getItemById(i);
            feature.eggTimer = (msg.extractPayloadByte(i + 1) * 60) + ((feature.eggTimer || 0) % 60);
        }
    }
    private static processEggTimerMinutes(msg: Inbound) {
        for (let i = 1; i < msg.payload.length - 1 && i <= sys.equipment.maxFeatures; i++) {
            var feature: Feature = sys.features.getItemById(i);
            feature.eggTimer = (Math.floor(feature.eggTimer / 60) * 60) + msg.extractPayloadByte(i + 1);
        }
    }
    private static processShowInFeatures(msg: Inbound) {
        for (let i = 1; i < msg.payload.length - 1 && i <= sys.equipment.maxFeatures; i++) {
            var feature: Feature = sys.features.getItemById(i);
            feature.showInFeatures = msg.extractPayloadByte(i + 1) > 0;
        }
    }

}