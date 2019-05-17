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

var _UOM = {
    "UOM": 0,
    "UOMStr": "unknown"
}

export namespace UOM
{
    export function init ()
    {
        _UOM = {
            "UOM": 0,
            "UOMStr": "unknown"
        }
    }


    export function setUOM ( uom: number ): void
    {
        _UOM.UOM = uom
        _UOM.UOMStr = String.fromCharCode( 176 ) +
            ( uom === 0 ?
                ' Farenheit' :
                ' Celsius' )
    }

    export function getUOM ()
    {
        return { 'UOM': _UOM }
    }

    export function getUOMStr (): string
    {
        return _UOM.UOMStr
    }
}