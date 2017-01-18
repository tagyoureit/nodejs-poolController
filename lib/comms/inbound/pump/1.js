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

    if (container.logModuleLoading)
        container.logger.info('Loading: (pump)1.js')


    var s = container.settings
    var logger = container.logger





    function process(data, counter) {
        var pump = data[container.constants.packetFields.FROM]


        var str1;
        var str2;
        var setAmount = data[8] * 256 + data[9];

        if (data[5] === 2) // Length==2 is a response.
        {
            container.pump.pumpACK(data, data[container.constants.packetFields.FROM], counter)
        } else if (data[6] === 3) {
            switch (data[7]) {

                case 33: //0x21
                    {
                        program = (data[8] * 256 + data[9]) / 8
                        container.pump.setCurrentProgramFromController(program, data[container.constants.packetFields.FROM], data, counter)
                        break;
                    }
                case 39: //0x27
                    {
                        var program = 1
                        var rpm = data[8] * 256 + data[9];
                        container.pump.saveProgramAs(program, rpm, data[container.constants.packetFields.FROM], data, counter)
                        break;
                    }
                case 40: //0x28
                    {
                        var program = 2
                        var rpm = data[8] * 256 + data[9];
                        container.pump.saveProgramAs(program, rpm, data[container.constants.packetFields.FROM], data, counter)
                        break;
                    }
                case 41: //0x29
                    {
                        var program = 3
                        var rpm = data[8] * 256 + data[9];
                        container.pump.saveProgramAs(program, rpm, data[container.constants.packetFields.FROM], data, counter)
                        break;
                    }
                case 42: //0x2a
                    {
                        var program = 4
                        var rpm = data[8] * 256 + data[9];
                        container.pump.saveProgramAs(program, rpm, data[container.constants.packetFields.FROM], data, counter)
                        break;
                    }
                case 43: //0x2B
                    {
                        str1 = 'Set Pump Timer for ';
                        //commented out the following line because we are not sure what the timer actually does
                        //leaving it in creates problems for ISY that might rely on this variable
                        //pumpStatus.timer = setAmount;
                        str2 = setAmount.toString() + ' minutes'
                        break;
                    }
                default:
                    {
                        str1 = 'unknown(?)'
                    }

            }

            //if (s.logPumpMessages)
            //    logger.verbose('Msg# %s   %s: %s %s %s', counter, container.constants.ctrlString[data[container.constants.packetFields.FROM]], str1, str2, JSON.stringify(data));
            decoded = true;
        } else if (data[6] === 2) // data[4]: 1== Response; 2==IntelliTouch; 3==Intellicom2(?)/manual
        {

            var str1;
            var setAmount = data[8] * 256 + data[9];
            if (s.logPumpMessages)
                logger.verbose('Msg# %s   %s --> %s: Set Speed to %s rpm: %s', counter, container.constants.ctrlString[data[container.constants.packetFields.FROM]], container.constants.ctrlString[data[container.constants.packetFields.DEST]], setAmount, JSON.stringify(data));
        } else {
            str1 = '[' + data[6] + ',' + data[7] + ']';
            str2 = ' rpm(?)'
            logger.warn('Msg# %s  Pump data ? %s %s', counter, str1, str2, data)
        }


    }

    if (container.logModuleLoading)
        container.logger.info('Loaded: (pump)1.js')



    return {
        process: process
    }
}
