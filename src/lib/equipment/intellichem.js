/*  nodejs-poolController.  An application to control pool equipment.
 *  Copyright (C) 2016, 2017.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as
 *  published by the Free Software Foundation, either version 3 of the
 *  License, or (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

module.exports = function(container) {

    /*
    //Status 0x12 (18) - Intellichem Status (length 41)
    example:
      0  1  2  3  4  5  6   7  8   9 10  11 12  13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29  30 31 32 33  34 35 36 37 38 39  40 41 42 43 44 45 46
                           E3 02  AF 02  EE 02  BC 00 00 00 02 00 00 00 2A 00 04 00 5C 06 05 18 01  90 00 00 00  96 14 00 51 00 00  65 20 3C 01 00 00 00
    165,16,15,16,18 41, 2 227  2 175  2 238  2 188  0  0  0  2  0  0  0 42  0  4  0 92  6  5 24  1 144  0  0  0 150 20  0 81  0  0 101 32 60  1  0  0  0
                       ph--- orp---  ph---- orp---                                     tanks    ch----      CYA TA----             MODE--
    6-7 pH(1-2) / ORP(8-9) reading
    02 E3 - pH 2*256 + e3(227) = 739
    02 AF - ORP 2*256 + af(175) = 687

    10-11 pH settings
    D0 = 7.2 (hi/lo bits - 720 = 7.2pH)
    DA = 7.3
    E4 = 7.4
    EE = 7.5
    F8 = 7.6

    12-13 ORP settings
    02 BC = 700 (hi/lo bits)

    26-27 Tank levels; 21 is acid? 22 is chlorine?
    06 and 05

    29-30 Chlorine settings
    90 is CH (90 = 400; 8b = 395) hi/lo bits

    32
    00 is CYA (00 = 0; 9 = 9; c9 = 201) (does not appear to have hi/lo - 201 is max

    33-34 - Total Alkalinity
    96 is TA (96 = 150)

    36 - Water Flow Alarm (00 is ok; 01 is no flow)
    00 flow is OK
    01 flow is Alarm on (Water STOPPED)

    40 Mode
    0x25 dosing (auto)?
    0x45 dosing acid (manually?)
    0x55 mixing???
    0x65 monitoring
    0x02 (12 when mixing) and 04 (27 when mixing) related???

    41
    20 Nothing
    22 Dosing Chlorine(?)

     */


    var intellichem = {}


    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: intellichem.js')

    var intellichemPresent = 0;

    function calculateCalciumHardnessFactor() {
        var CH = 0;
        var ppm = intellichem.settings.CALCIUMHARDNESS
        if (ppm <= 25) CH = 1.0
        else if (ppm <= 50) CH = 1.3
        else if (ppm <= 75) CH = 1.5
        else if (ppm <= 100) CH = 1.6
        else if (ppm <= 125) CH = 1.7
        else if (ppm <= 150) CH = 1.8
        else if (ppm <= 200) CH = 1.9
        else if (ppm <= 250) CH = 2.0
        else if (ppm <= 300) CH = 2.1
        else if (ppm <= 400) CH = 2.2
        else if (ppm <= 800) CH = 2.5
        return CH
    }

    function calculateTemperatureFactor() {
        var TF = 0;
        var temp = container.temperatures.getTemperatures().poolTemp
        if (container.UOM.getUOMStr() === 'Fahrenheit') {
            if (temp <= 32) TF = 0.0
            else if (temp <= 37) TF = 0.1
            else if (temp <= 46) TF = 0.2
            else if (temp <= 53) TF = 0.3
            else if (temp <= 60) TF = 0.4
            else if (temp <= 66) TF = 0.5
            else if (temp <= 76) TF = 0.6
            else if (temp <= 84) TF = 0.7
            else if (temp <= 94) TF = 0.8
            else if (temp <= 105) TF = 0.9
        } else {
            if (temp <= 0) TF = 0.0
            else if (temp <= 2.8) TF = 0.1
            else if (temp <= 7.8) TF = 0.2
            else if (temp <= 11.7) TF = 0.3
            else if (temp <= 15.6) TF = 0.4
            else if (temp <= 18.9) TF = 0.5
            else if (temp <= 24.4) TF = 0.6
            else if (temp <= 28.9) TF = 0.7
            else if (temp <= 34.4) TF = 0.8
            else if (temp <= 40.6) TF = 0.9
        }
        return TF
    }

    function correctedAlkalinity() {
        return intellichem.settings.TOTALALKALINITY - (intellichem.settings.CYA / 3)
    }

    function calculateTotalCarbonateAlkalinity() {
        var ppm = correctedAlkalinity()
        var AF = 0;
        if (ppm <= 25) AF = 1.4
        else if (ppm <= 50) AF = 1.7
        else if (ppm <= 75) AF = 1.9
        else if (ppm <= 100) AF = 2.0
        else if (ppm <= 125) AF = 2.1
        else if (ppm <= 150) AF = 2.2
        else if (ppm <= 200) AF = 2.3
        else if (ppm <= 250) AF = 2.4
        else if (ppm <= 300) AF = 2.5
        else if (ppm <= 400) AF = 2.6
        else if (ppm <= 800) AF = 2.9
        return AF
    }

    function calculateTotalDisolvedSolidsFactor() {
        // 12.1 for non-salt pools; 12.2 for salt pools
        return container.settings.get('chlorinator').installed ? 12.2 : 12.1
    }

    function processIntellichemControllerPacket(data, counter) {

        intellichem.readings.PH = ((data[container.constants.intellichemPacketFields.PHREADINGHI] * 256) + data[container.constants.intellichemPacketFields.PHREADINGLO]) / 100
        intellichem.readings.ORP = (data[container.constants.intellichemPacketFields.ORPREADINGHI] * 256) + data[container.constants.intellichemPacketFields.ORPREADINGLO]
        intellichem.readings.WATERFLOW = data[container.constants.intellichemPacketFields.WATERFLOW]
        intellichem.readings.SALT = container.settings.chlorinator ? container.chlorinator.getSaltPPM() : 0

        intellichem.settings.PH = ((data[container.constants.intellichemPacketFields.PHSETPOINTHI] * 256) + data[container.constants.intellichemPacketFields.PHSETPOINTLO]) / 100
        intellichem.settings.ORP = (data[container.constants.intellichemPacketFields.ORPSETPOINTHI] * 256) + data[container.constants.intellichemPacketFields.ORPSETPOINTLO]
        intellichem.settings.CYA = data[container.constants.intellichemPacketFields.CYAREADING]
        intellichem.settings.CALCIUMHARDNESS = (data[container.constants.intellichemPacketFields.CALCIUMHARDNESSHI] * 256) + data[container.constants.intellichemPacketFields.CALCIUMHARDNESSLO]
        intellichem.settings.TOTALALKALINITY = (data[container.constants.intellichemPacketFields.TOTALALKALINITYREADINGHI] * 256) + data[container.constants.intellichemPacketFields.TOTALALKALINITYREADINGLO]

        intellichem.tankLevels[1] = data[container.constants.intellichemPacketFields.TANK1]
        intellichem.tankLevels[2] = data[container.constants.intellichemPacketFields.TANK2]

        intellichem.mode[1] = data[container.constants.intellichemPacketFields.MODE1]
        intellichem.mode[2] = data[container.constants.intellichemPacketFields.MODE2]

        if (!container._.isEqual(intellichem.lastPacket, data)) {
            intellichem.lastPacket = container._.clone(data)
            intellichem.readings.SI = Math.round((intellichem.readings.PH + calculateCalciumHardnessFactor() + calculateTotalCarbonateAlkalinity() + calculateTemperatureFactor() - calculateTotalDisolvedSolidsFactor()) * 1000) / 1000
            if (container.settings.get('logIntellichem')) {
                container.logger.info('Msg# %s  Intellichem packet found: \n\t', counter, JSON.stringify(container._.omit(intellichem, 'lastPacket'), null, 2))
                container.logger.debug('Msg# %s  Intellichem packet: %s', counter, data)
                container.logger.info('Msg# %s  Intellichem Saturation Index:\n\tSI = pH + CHF + AF + TF - TDSF\n\t%s = %s + %s + %s + %s - %s', counter, intellichem.readings.SI, intellichem.readings.PH, calculateCalciumHardnessFactor(), calculateTotalCarbonateAlkalinity(), calculateTemperatureFactor(), calculateTotalDisolvedSolidsFactor())
            }
            container.io.emitToClients('intellichem')
        }
        else {
            container.logger.debug('Msg# %s  Duplicate Intellichem packet.')
        }

    }

    function getCurrentIntellichem() {
           return {'intellichem': intellichem}
    }

    var init = function() {
        intellichem = {
            'readings': {
                'PH': -1,
                'ORP': -1,
                'WATERFLOW': -1,
                'SI': -1,
                'SALT': -1
            },
            'settings': {
                'PH': -1,
                'ORP': -1,
                'CYA': -1,
                'CALCIUMHARDNESS': -1,
                'TOTALALKALINITY': -1
            },
            'tankLevels': {
                '1': -1,
                '2': -1
            },
            'mode': {
                '1': -1,
                '2': -1
            },
            'lastPacket': []
        }
        container.logger.debug('Initialized intellichem module')
    }



    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: intellichem.js')

    return {
        init: init,
        processIntellichemControllerPacket: processIntellichemControllerPacket,
        getCurrentIntellichem: getCurrentIntellichem
    }


}
