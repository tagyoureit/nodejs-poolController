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

    var customNameArr

module.exports = function(container) {
    var logger = container.logger


    var initialCustomNamesDiscovered = 0
    var numberOfCustomNames = 10;

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: circuit.js')


    function getCustomName(index) {
        return customNameArr[index]
    }

    var init = function(){
        customNameArr = [];
        numberOfCustomNames = container.settings.get('equipment.controller.intellitouch.numberOfCustomNames')
    }

    var displayInitialCustomNames = function() {
        //display custom names when we reach the last circuit

        logger.info('\n  Custom Circuit Names retrieved from configuration: ', customNameArr)
        initialCustomNamesDiscovered = 1
    }

    var setCustomName = function(index, nameBytes, counter) {
        var customName=""
        for (var i = 0; i < nameBytes.length; i++) {
            if (nameBytes[i] > 0 && nameBytes[i] < 251) //251 is used to terminate the custom name string if shorter than 11 digits
            {
                customName += String.fromCharCode(nameBytes[i])
            }
            else {
                break
            }
        }

        if (container.settings.get('logConfigMessages')) {
            logger.silly('Msg# %s  Custom Circuit Name Raw:  %s  & Decoded: %s', counter, JSON.stringify(nameBytes), customName)
                //logger.verbose('Msg# %s  Custom Circuit Name Decoded: "%s"', counter, customName)
        }

        customNameArr[index] = customName;

        if (initialCustomNamesDiscovered === 0 && index === (numberOfCustomNames - 1)) {
            displayInitialCustomNames()
        } else
        if (customNameArr[index] !== customName) {
            logger.info('Msg# %s  Custom Circuit name %s changed to %s', counter, customNameArr[index], customName)
        }
    }


    var getNumberOfCustomNames = function(){
        return numberOfCustomNames
    }


    return {
        init: init,
        getCustomName: getCustomName,
        setCustomName: setCustomName,
        getNumberOfCustomNames: getNumberOfCustomNames
    }
}
