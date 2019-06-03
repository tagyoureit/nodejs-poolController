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

var UOM = {
    "UOM": 0,
    "UOMStr": "unknown"
}

module.exports = function(container) {

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: UOM.js')

    var init = function() {
        UOM = {
            "UOM": 0,
            "UOMStr": "unknown"
        }
    }


    function setUOM(uom) {
        UOM.UOM = uom
        UOM.UOMStr = (uom === 0) ? 'Fahrenheit' : 'Celsius'
    }

    function getUOM() {
            return {'UOM': UOM}
    }

    function getUOMStr() {
        return UOM.UOMStr
    }

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: UOM.js')


    return {
        init: init,
        setUOM: setUOM,
        getUOM: getUOM,
        getUOMStr: getUOMStr
    }
}
