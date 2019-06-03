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


//search placeholders for sockets.io Search
export var searchMode  = 'load'
export var searchSrc  =  [0];
export var searchDest = [0];
export var searchAction = [ 0 ];
export var searchAllorAny = 'all'

/**
 *
 *
 * @export
 * @interface ISearch
 */
export interface ISearch
    {
        searchMode: string,
        searchSrc: number[],
        searchDest: number[],
        searchAction: number[]
        searchAllorAny: 'all'|'any'
    }

    export function setSearch ( apiSearch: ISearch )
    {
        searchMode = apiSearch.searchMode
        searchAllorAny = apiSearch.searchAllorAny
        searchSrc = apiSearch.searchSrc
        searchDest = apiSearch.searchDest
        searchAction = apiSearch.searchAction
    }
