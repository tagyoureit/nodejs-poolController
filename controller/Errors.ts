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
import extend = require("extend");
import { Message, Outbound, Inbound } from "./comms/messages/Messages";
import * as path from "path";

// Internal abstract class for all errors.
class ApiError extends Error {
    constructor(message: string, code?: number, httpCode?: number) {
        super(message);
        this.name = 'ApiError';
        this.code = code || 0;
        this.httpCode = httpCode || 400;
        let pos: any = {};
        if (typeof this.stack !== 'undefined') {
            try {
                // Another weirdo decision by NodeJS to not include the line numbers and source.  Only a text based stack trace.
                let lines = this.stack.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    let line = lines[i];
                    if (line.trimLeft().startsWith('at ')) {
                        let lastParen = line.lastIndexOf(')');
                        let firstParen = line.indexOf('(');
                        if (lastParen >= 0 && firstParen >= 0) {
                            let p = line.substring(firstParen + 1, lastParen);
                            let m = /(\:\d+\:\d+)(?!.*\1)/g;
                            let matches = p.match(m);
                            let linecol = '';
                            let lastIndex = -1;
                            if (matches.length > 0) {
                                linecol = matches[matches.length - 1];
                                lastIndex = p.lastIndexOf(linecol);
                                p = p.substring(0, lastIndex);
                                if (linecol.startsWith(':')) linecol = linecol.substring(1);
                                let lastcolon = linecol.lastIndexOf(':');
                                if (lastcolon !== -1) {
                                    pos.column = parseInt(linecol.substring(lastcolon + 1), 10);
                                    pos.line = parseInt(linecol.substring(0, lastcolon), 10);
                                }
                            }
                            let po = path.parse(p);
                            pos.dir = po.dir;
                            pos.file = po.base;
                        }
                        break;
                    }
                }
            } catch (e) { }
        }
        this.position = pos;
    }
    public code: number = 0;
    public httpCode: number = 500;
    public position: any = {}
}
class EquipmentError extends ApiError {
    constructor(message: string, code: number, eqType: string) {
        super(message, 210, 400);
        this.name = 'EquipmentError';
        this.equipmentType = eqType;
    }
    public equipmentType: string;
}
export class EquipmentNotFoundError extends EquipmentError {
    constructor(message: string, eqType: string) {
        super(message, 204, eqType);
        this.name = 'EquipmentNotFound';
    }
}
export class InvalidEquipmentIdError extends EquipmentError {
    constructor(message: string, id: number, eqType: string) {
        super(message, 250, eqType);
        this.name = 'InvalidEquipmentId';
    }
    public id: number;
}
export class InvalidEquipmentDataError extends EquipmentError {
    constructor(message: string, eqType: string, eqData) {
        super(message, 270, eqType);
        this.name = 'InvalidEquipmentData';
        this.eqData = eqData;
    }
    public eqData;
}
export class ServiceProcessError extends ApiError {
    constructor(message: string, serviceName: string, process?: string) {
        super(message, 290, 400);
        this.name = 'ServiceProcessError';
        this.service = serviceName;
        this.process = process;
    }
    public process: string;
    public service: string;
}
export class ServiceParameterError extends ApiError {
    constructor(message: string, serviceName: string, paramName: string, value) {
        super(message, 280, 400);
        this.name = 'InvalidServiceParameter';
        
        this.value = value;
        this.parameter = paramName;
        this.service = serviceName;
    }
    public value;
    public parameter: string;
    public service: string;
}
export class InvalidOperationError extends ApiError {
    constructor(message: string, operation: string) {
        super(message, 100, 400);
        this.name = 'InvalidOperation';
        this.operation = operation;
    }
    public operation: string;
}
export class EquipmentTimeoutError extends ApiError {
    constructor(message: string, operation: string) {
        super(message, 100, 400);
        this.name = 'TimeoutError';
        this.operation = operation;
    }
    public operation: string;
}
export class ParameterOutOfRangeError extends InvalidOperationError {
    constructor(message: string, operation: string, parameter: string, value) {
        super(message, operation);
        this.name = 'ParameterOutOfRange';
        this.operation = operation;
    }
    public value;
    public parameter: string;
}
export class BoardProcessError extends ApiError {
    constructor(message: string, process?: string) {
        super(message, 300, 400);
        this.name = 'ProcessingError';
        this.process = process;
    }
    public process: string;
    
}

export class MessageError extends ApiError {
    constructor(msg: Message, message: string, code?: number, httpCode?: number) {
        super(message, code, httpCode);
        this.name = 'MessageError';
        this.msg = msg;
        this.code = code || 500;
    }
    public msg: Message;
}
export class OutboundMessageError extends MessageError {
    constructor(msg: Outbound, message: string, code?: number, httpCode?: number) {
        super(msg, message, code, httpCode);
        this.name = 'OutboundMessageError';
        this.code = code || 501;
    }
}
export class InboundMessageError extends MessageError {
    constructor(msg: Inbound, message: string, code?: number, httpCode?: number) {
        super(msg, message, code, httpCode);
        this.name = 'InboundMessageError';
        this.code = code || 502;
    }
}

