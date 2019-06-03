//  nodejs-poolController.  An application to control pool equipment.
//  Copyright (C) 2016, 2017, 2018, 2019.  Russell Goldin, tagyoureit.  russ.goldin@gmail.com
//
//  This program is free software: you can redistribute it and/or modify
//  it under the terms of the GNU Affero General Public License as
//  published by the Free Software Foundation, either version 3 of the
//  License, or (at your option) any later version.
//
//  This program is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU Affero General Public License for more details.
//
//  You should have received a copy of the GNU Affero General Public License
//  along with this program.  If not, see <http://www.gnu.org/licenses/>.

export function formatTime ( _hour: number | string, _min: number | string )
{

    let hour: number;
    let min: number;
    let minStr: string;
    if ( typeof _hour === 'string' )
        {
        hour = parseInt( _hour )
    }
    else
    {
        hour = _hour
    }
    if ( typeof _min === 'string' )
    {
        min = parseInt( _min );        
    }
    else
        min = _min


    let ampm = '';
    if ( hour >= 12 )
    {
        ampm = "PM";
    }
    else
    {
        ampm = "AM";
    }
    if ( hour >= 13 )
        hour = hour - 12;
    else if ( hour === 0 )
    {
        hour += 12;
    }
    if ( min < 10 )
    {
        minStr = pad(min, 2, "0");
    }
    else 
        minStr = min.toString()
    let timeStr = `${hour}:${minStr} ${ampm}`;
    return timeStr;
}

    // from https://stackoverflow.com/a/10073788/7386278
    export function pad ( n: number, width: number, z: string )
    {
        return ( String( z ).repeat( width ) + String( n ) ).slice( String( n ).length )
    }