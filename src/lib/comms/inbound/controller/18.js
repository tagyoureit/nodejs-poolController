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

// Get Schedules
module.exports = function(container) {

  /*istanbul ignore next */
  if (container.logModuleLoading)
    container.logger.info('Loading: 18.js')

    var intellichem = {
      'readings': {
        'ph': -1,
        'ORP': -1,
        'CYA': -1,
        'totalAvailable': -1,
        'waterFlow': -1
      },
      'setpoint': {
        'ph': -1,
        'ORP': -1,
        'chlorine': -1
      },
      'tankLevels': {
        '1': -1,
        '2': -1
      },
      'mode': {
        '1': -1,
        '2': -1
      }
    }

    var intellichemPacketFields = {
        DEST: 2,
        ACTION: 3,
        PHREADINGHI: 6,
        PHREADINGLO: 7,
        ORPREADINGHI: 8,
        ORPREADINGLO: 9,
        PHSETPOINTHI: 10,
        PHSETPOINTLO: 11,
        TANK1: 26,
        TANK2: 27,
        CHLORINESETPOINTHI: 30,
        CHLORINESETPOINTLO: 31,
        CYAREADING: 33,
        TOTALAVAILABLEREADINGHI: 34,
        TOTALAVAILABLEREADINGLO: 35,
        MODE1: 40,
        MODE2: 41
    }
    /*
    //Status 0x12 (18) - Intellichem Status (length 41)
    example:
      0  1  2  3  4  5  6   7  8   9 10  11 12  13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29  30 31 32 33  34 35 36 37 38 39  40 41 42 43 44 45 46
                           E3 02  AF 02  EE 02  BC 00 00 00 02 00 00 00 2A 00 04 00 5C 06 05 18 01  90 00 00 00  96 14 00 51 00 00  65 20 3C 01 00 00 00
    165,16,15,16,18 41, 2 227  2 175  2 238  2 188  0  0  0  2  0  0  0 42  0  4  0 92  6  5 24  1 144  0  0  0 150 20  0 81  0  0 101 32 60  1  0  0  0
                       ph--- orp---  ph---- orp---                                     tanks       ch----   CYA TA----             MODE--
    6-7 pH(1-2) / ORP(8-9) reading
    02 E3 - pH 2*256 + e3(227) = 739
    02 AF - ORP 2*256 + af(175) = 687

    10-11 pH setpoint
    D0 = 7.2 (hi/lo bits - 720 = 7.2pH)
    DA = 7.3
    E4 = 7.4
    EE = 7.5
    F8 = 7.6

    12-13 ORP setpoint
    02 BC = 700 (hi/lo bits)

    26-27 Tank levels; 21 is acid? 22 is chlorine?
    06 and 05

    30-31 Chlorine setpoint
    90 is CH (90 = 400; 8b = 395) hi/lo bits

    33
    00 is CYA (00 = 0; 9 = 9; c9 = 201) (does not appear to have hi/lo - 201 is max

    34-35
    96 is TA (96 = 150)

    34 - Water Flow Alarm (00 is ok; 01 is no flow)
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


  function process(data, counter) {
    //byte:      0  1  2  3  4 5 6 7 8  9 10 11  12 13 14
    //example:

    if (container.settings.logConfigMessages)
      container.logger.silly('\nMsg# %s  IntelliChem packet %s', counter, JSON.stringify(data))

    intellichem.readings.ph = ((data[intellichemPacketFields.PHREADINGHI]*256)+data[intellichemPacketFields.PHREADINGLO])/100
    intellichem.readings.ORP = (data[intellichemPacketFields.ORPREADINGHI]*256)+data[intellichemPacketFields.ORPREADINGLO]
    intellichem.readings.CYA = (data[intellichemPacketFields.CYAREADINGHI]*256)+data[intellichemPacketFields.CYAREADINGLO]
    intellichem.readings.totalAvailable = (data[intellichemPacketFields.TOTALAVAILABLEREADINGHI]*256)+data[intellichemPacketFields.TOTALAVAILABLEREADINGLO]

    intellichem.setpoint.ph = ((data[intellichemPacketFields.PHSETPOINTHI]*256)+data[intellichemPacketFields.PHSETPOINTLO])/100
    intellichem.setpoint.ORP = (data[intellichemPacketFields.ORPSETPOINTHI]*256)+data[intellichemPacketFields.ORPSETPOINTLO]
    intellichem.setpoint.chlorine = (data[intellichemPacketFields.CHLORINESETPOINTHI]*256)+data[intellichemPacketFields.CHLORINESETPOINTLO]

    intellichem.tankLevels[1] = data[intellichemPacketFields.TANK1]
    intellichem.tankLevels[2] = data[intellichemPacketFields.TANK2]

    intellichem.mode[1] = data[intellichemPacketFields.MODE1]
    intellichem.mode[2] = data[intellichemPacketFields.MODE2]

    container.logger.info('Intellichem packet found: \n\t', JSON.stringify(intellichem,null,2))

    return true
  }

  /*istanbul ignore next */
  if (container.logModuleLoading)
    container.logger.info('Loaded: 18.js')


  return {
    process: process
  }
}
