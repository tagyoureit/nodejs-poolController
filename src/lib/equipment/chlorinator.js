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


var currentChlorinatorStatus

module.exports = function (container) {

    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loading: chlorinator.js')

    function Chlorinator(installed, saltPPM, currentOutput, outputPoolPercent, outputSpaPercent, superChlorinate, version, name, status) {
        this.installed = installed;
        this.saltPPM = saltPPM;
        this.currentOutput = currentOutput //actual output as reported by the chlorinator
        this.outputPoolPercent = outputPoolPercent; //for intellitouch this is the pool setpoint, for standalone it is the default
        this.outputSpaPercent = outputSpaPercent; //intellitouch has both pool and spa set points
        this.superChlorinate = superChlorinate;
        this.superChlorinateHours;
        this.version = version;
        this.name = name;
        this.status = status;
        this.controlledBy;
    }


    var init = function () {

        currentChlorinatorStatus = new Chlorinator(0, -1, -1, -1, -1, -1, -1, -1);
        output = container.settings.get('equipment.chlorinator.desiredOutput')

        currentChlorinatorStatus.outputPoolPercent = output.pool
        currentChlorinatorStatus.outputSpaPercent = output.spa
        currentChlorinatorStatus.name = container.settings.get('equipment.chlorinator.id.productName')
        return


    }

    var chlorinatorStatusStr = function (status) {
        // 0: "Ok",
        // 1: "No flow",
        // 2: "Low Salt",
        // 4: "High Salt",
        // 132: "Comm Link Error(?).  Low Salt",
        // 144: "Clean Salt Cell",
        // 145: "???"
        //MSb to LSb [ "Check Flow/PCB","Low Salt","Very Low Salt","High Current","Clean Cell","Low Voltage","Water Temp Low","No Comm","OK" ]
        var chlorStr = ''
        var needDelim = 0;
        if ((status === 0)) {
            chlorStr += 'Ok';
            needDelim = 1
        }

        if ((status & 1) === 1) {
            needDelim ? chlorStr += ', ' : needDelim = 1
            chlorStr += 'Low Flow'; //1
        }
        if ((status & 2) >> 1 === 1) {
            needDelim ? chlorStr += ', ' : needDelim = 1
            chlorStr += 'Low Salt'; // 2
        }
        if ((status & 4) >> 2 === 1) {
            needDelim ? chlorStr += ', ' : needDelim = 1
            chlorStr += 'Very Low Salt'; // 4
        }
        if ((status & 8) >> 3 === 1) {
            needDelim ? chlorStr += ', ' : needDelim = 1
            chlorStr += 'High Current'; //8
        }
        if ((status & 16) >> 4 === 1) {
            needDelim ? chlorStr += ', ' : needDelim = 1
            chlorStr += 'Clean Cell'; //16
        }
        if ((status & 32) >> 5 === 1) {
            needDelim ? chlorStr += ', ' : needDelim = 1
            chlorStr += 'Low Voltage'; //32
        }
        if ((status & 64) >> 6 === 1) {
            needDelim ? chlorStr += ', ' : needDelim = 1
            chlorStr += 'Water Temp Low'; //64
        }
        // Following seems to result in no communication messages when there is communication.
        if ((status & 128) >> 7 === 1) {
            needDelim ? chlorStr += ', ' : needDelim = 1
            chlorStr += 'Ok'  // seems to be an ok string despite the check flow from below.
        }
        return chlorStr
        //
        // 0: "Ok",
        // 1: "No communications",
        // 2: "Water Temp Low",
        // 4: "Low Voltage",
        // 8: "Clean Cell",
        // 16: "High Current",
        // 32: "Very Low Salt",
        // 64: "Low Salt",
        // 128: "Check Flow/PCB"
    }

    function setChlorinatorControlledBy(which) {
        currentChlorinatorStatus.controlledBy = which
    }

    function updateChlorinatorStatusFromController(saltPPM, outputPoolPercent, outputSpaPercent, superChlorinate, status, name, counter) {
        var chlorinatorStatus = {}

        // make sure we copy the property so it isn't lost (controlledBy will only be set once from the virtual controller)

        if (currentChlorinatorStatus.controlledBy) {
            chlorinatorStatus.controlledBy = currentChlorinatorStatus.controlledBy
        }
        else {
            container.chlorinatorController.startChlorinatorController()
        }

        chlorinatorStatus.saltPPM = saltPPM * 50

        // without a whole lot of logic, we are relying on the chlorinator packet itself to tell
        // us if super chlorinate is true
        chlorinatorStatus.currentOutput = currentChlorinatorStatus.hasOwnProperty('currentOutput') ? currentChlorinatorStatus.currentOutput : 0; //if chlorinator has reported a current output percent, keep it.  Otherwise set to 0


        chlorinatorStatus.outputPoolPercent = outputPoolPercent

        // outputSpaPercent field is aaaaaaab (binary) where aaaaaaa = % and b===installed (0=no,1=yes)
        // eg. a value of 41 is 00101001
        // installed = (aaaaaaa)1 so 1 = installed
        // spa percent = 0010100(b) so 10100 = 20
        chlorinatorStatus.installed = outputSpaPercent && 1 === 1 ? 1 : 0;
        chlorinatorStatus.outputSpaPercent = outputSpaPercent >> 1;

        if (chlorinatorStatus.controlledBy === 'virtual') {
            chlorinatorStatus.superChlorinate = outputPoolPercent >= 100 ? 1 : 0;
            // how many hours does super chlorinate run for?
            chlorinatorStatus.superChlorinateHours = 96;

        }
        else {
            chlorinatorStatus.superChlorinate = superChlorinate > 0 ? 1 : 0
            chlorinatorStatus.superChlorinateHours = superChlorinate
        }

        //TODO: take care of unknown status' here.  Is this right?
        chlorinatorStatus.status = chlorinatorStatusStr(status)
        chlorinatorStatus.name = name;

        if (currentChlorinatorStatus.status === undefined) {
            currentChlorinatorStatus = JSON.parse(JSON.stringify(chlorinatorStatus));
            if (container.settings.get('logChlorinator'))
                container.logger.info('Msg# %s   Initial chlorinator settings discovered: ', counter, JSON.stringify(currentChlorinatorStatus))
            container.settings.updateChlorinatorInstalledAsync(chlorinatorStatus.installed)
            container.settings.updateChlorinatorNameAsync(chlorinatorStatus.name)
            container.settings.updateChlorinatorDesiredOutputAsync(chlorinatorStatus.outputPoolPercent, chlorinatorStatus.outputSpaPercent)
            container.io.emitToClients('chlorinator');

        } else if (JSON.stringify(currentChlorinatorStatus) === JSON.stringify(chlorinatorStatus)) {
            if (container.settings.get('logChlorinator'))
                container.logger.debug('Msg# %s   Chlorinator status has not changed. ', counter)
        } else {
            if (container.settings.get('logChlorinator')) {
                container.logger.verbose('Msg# %s   Chlorinator status changed \nfrom: %s \nto: %s ', counter,
                    // currentChlorinatorStatus.whatsDifferent(chlorinatorStatus));
                    JSON.stringify(currentChlorinatorStatus), JSON.stringify(chlorinatorStatus))
            }
            container.settings.updateChlorinatorInstalledAsync(chlorinatorStatus.installed)
            container.settings.updateChlorinatorNameAsync(chlorinatorStatus.name)
            container.settings.updateChlorinatorDesiredOutputAsync(chlorinatorStatus.outputPoolPercent, chlorinatorStatus.outputSpaPercent)
            currentChlorinatorStatus = JSON.parse(JSON.stringify(chlorinatorStatus));
            container.io.emitToClients('chlorinator');
        }
        container.influx.writeChlorinator(currentChlorinatorStatus)
        return currentChlorinatorStatus

    }

    function getChlorinatorNameByBytes(nameArr) {
        var name = ''
        for (var i = 0; i < nameArr.length; i++) {
            name += String.fromCharCode(nameArr[i]);
            //console.log('i: %s ,namearr[i]: %s, char: %s  name: %s', i, nameArr[i],  String.fromCharCode(nameArr[i]) ,name )
        }
        return name
    }

    function getChlorinatorName() {
        return currentChlorinatorStatus.name
    }

    function getSaltPPM() {
        return this.saltPPM
    }

    function getChlorinatorStatus() {
        return {'chlorinator': currentChlorinatorStatus}
    }


    function setChlorinatorLevelAsync(chlorPoolLvl, chlorSpaLvl = -1, chlorSuperChlorinateHours = 0, callback) {

        // if the system is running just the chlorinator (virtual controller) then we just set a single value of 0 (off) through 100 (full) or 101 (superchlorinate).
        // intellicom only supports a single body of water, so we can set the chlorPoolLvl (0-100) and superChlorinate (in # of hours up to 96)
        // intellitouch/easytouch supports pool, spa and superchlorinate.

        //TODO: Refactor to be better async/promise return
        //NOTE: do we really need to do this logic?  If the controller is on, it will request the updates.  If the virtual controller is enabled, it should be active anyway.

        if (!currentChlorinatorStatus.controlledBy) {
            container.chlorinatorController.startChlorinatorController()
        }

        let response = {}
        if (currentChlorinatorStatus.controlledBy === 'virtual') {
            // check for valid settings to be sent to Chlorinator directly
            if (chlorPoolLvl >= 0 && chlorPoolLvl <= 101) {
                currentChlorinatorStatus.outputPoolPercent = chlorPoolLvl
            }
            else {

                response.text = 'FAIL: Request for invalid value for chlorinator (' + chlorPoolLvl + ').  Chlorinator will continue to run at previous level (' + currentChlorinatorStatus.outputPoolPercent + ')'
                response.status = this.status
                response.value = currentChlorinatorStatus.outputPoolPercent
                if (container.settings.get('logChlorinator')) {
                    container.logger.warn(response)
                }
                return Promise.resolve(response)
            }
        }
        else {
            // check for valid values with Intellicom/Intellitouch
            if (chlorPoolLvl === 101) {
                // assume we will set the superchlorinate for 1 hour
                chlorSuperChlorinateHours = 1
            }
            else if (chlorPoolLvl >= 0 && chlorPoolLvl <= 100) {
                currentChlorinatorStatus.outputPoolPercent = chlorPoolLvl
            }
            else {
                if (!chlorPoolLvl || chlorPoolLvl < -1 || chlorPoolLvl > 101) {
                    // -1 is valid if we don't want to change the setting.  Anything else is invalid and should trigger a fail.
                    currentChlorinatorStatus.outputPoolPercent = 0;
                    response.text = 'FAIL: Request for invalid value for chlorinator (' + chlorPoolLvl + ').  Chlorinator will continue to run at previous level (' + currentChlorinatorStatus.outputPoolPercent + ')'
                    response.status = this.status
                    response.value = currentChlorinatorStatus.outputPoolPercent
                    response.chlorinator = currentChlorinatorStatus
                    if (container.settings.get('logChlorinator')) {
                        container.logger.warn(response)
                    }
                    return Promise.resolve(response)
                }

            }
        }


        if (chlorSpaLvl >= 0 & chlorSpaLvl <= 100) {
            currentChlorinatorStatus.outputSpaPercent = chlorSpaLvl
        }
        else {
            if (!currentChlorinatorStatus.outputSpaPercent || currentChlorinatorStatus.outputSpaPercent < 0) {
                // just in case it isn't set.  otherwise we don't want to touch it
                currentChlorinatorStatus.outputSpaPercent = 0;
            }
        }

        if ((chlorSuperChlorinateHours > 0 & chlorSuperChlorinateHours <= 96) || currentChlorinatorStatus.superChlorinateHours>0) {
            currentChlorinatorStatus.superChlorinate = 1
            currentChlorinatorStatus.superChlorinateHours = chlorSuperChlorinateHours
        }
        else if (chlorSuperChlorinateHours === 0) {
            currentChlorinatorStatus.superChlorinate = 0
            currentChlorinatorStatus.superChlorinateHours = 0
        }

        if (container.settings.get('chlorinator.installed')) {
            if (currentChlorinatorStatus.controlledBy === 'virtual') {
                // chlorinator only has one setting; it doesn't know the difference between pool/spa
                return Promise.resolve()
                    .then(function () {
                        response.chlorinator = currentChlorinatorStatus
                        if (currentChlorinatorStatus.outputPoolPercent === 0) {
                            response.text = 'Chlorinator set to off.  Chlorinator will be queried every 30 mins for PPM'
                            response.status = 'off'
                            response.value = 0
                        } else if (currentChlorinatorStatus.outputPoolPercent >= 1 && currentChlorinatorStatus.outputPoolPercent <= 100) {
                            response.text = 'Chlorinator set to ' + currentChlorinatorStatus.outputPoolPercent + '%.'
                            response.status = 'on'
                            response.value = currentChlorinatorStatus.outputPoolPercent
                        } else if (currentChlorinatorStatus.outputPoolPercent === 101) {
                            response.text = 'Chlorinator set to super chlorinate'
                            response.status = 'on'
                            response.value = currentChlorinatorStatus.outputPoolPercent
                        }
                    })
                    .then(container.settings.updateChlorinatorDesiredOutputAsync(currentChlorinatorStatus.outputPoolPercent, currentChlorinatorStatus.outputSpaPercent))
                    .then(function () {
                        container.io.emitToClients('chlorinator')
                        if (container.chlorinatorController.isChlorinatorTimerRunning())
                            container.chlorinatorController.chlorinatorStatusCheck()  //This is causing problems if the chlorinator is offline (repeated calls to send status packet.)
                        else
                            container.queuePacket.queuePacket([16, 2, 80, 17, currentChlorinatorStatus.outputPoolPercent])
                        if (container.settings.get('logChlorinator')) {
                            container.logger.info(response)
                        }
                        return response
                    })
            }

            else if (currentChlorinatorStatus.controlledBy === 'intellicom') {
                // chlorinator controlled by intellicom; it only has the pool setting

                return Promise.resolve()
                    .then(function () {
                        response.chlorinator = currentChlorinatorStatus
                        response.text = `Chlorinator set to ${currentChlorinatorStatus.outputPoolPercent} and SuperChlorinate is ${currentChlorinatorStatus.superChlorinate} for ${currentChlorinatorStatus.superChlorinateHours} hours.`
                        response.status = 'on'
                        response.value = currentChlorinatorStatus.outputPoolPercent

                    })
                    .then(container.settings.updateChlorinatorDesiredOutputAsync(currentChlorinatorStatus.outputPoolPercent, currentChlorinatorStatus.outputSpaPercent))
                    .then(function () {
                        // TODO: Check if the packet is the same on Intellicom (sans Spa setting)... currently it is the same as Intellichlor but the response is formatted differently.
                        container.queuePacket.queuePacket([165, container.intellitouch.getPreambleByte(), 16, container.settings.get('appAddress'), 153, 10, outputSpaByte(), currentChlorinatorStatus.outputPoolPercent, 0, superChlorinateByte(), 0, 0, 0, 0, 0, 0, 0])

                    })

                if (container.settings.get('logChlorinator')) {
                    container.logger.info(response)
                }
            }

            else {
                // controlled by Intellitouch.  We should set both pool and spa levels at the controller

                return Promise.resolve()
                    .then(function () {
                        response.chlorinator = currentChlorinatorStatus
                        response.text = `Chlorinator pool set to ${currentChlorinatorStatus.outputPoolPercent}, spa set to ${currentChlorinatorStatus.outputSpaPercent} and SuperChlorinate is ${currentChlorinatorStatus.superChlorinate} for ${currentChlorinatorStatus.superChlorinateHours} hours.`
                        response.status = 'on'
                        response.value = currentChlorinatorStatus.outputPoolPercent

                    })
                    .then(container.settings.updateChlorinatorDesiredOutputAsync(currentChlorinatorStatus.outputPoolPercent, currentChlorinatorStatus.outputSpaPercent))
                    .then(function () {
                        container.queuePacket.queuePacket([165, container.intellitouch.getPreambleByte(), 16, container.settings.get('appAddress'), 153, 10, outputSpaByte(), currentChlorinatorStatus.outputPoolPercent, superChlorinateByte(), 0, 0, 0, 0, 0, 0, 0])
                        if (container.settings.get('logChlorinator')) {
                            container.logger.info(response)
                        }
                        return response
                    })


            }
            container.io.emitToClients('chlorinator')
        }

        else {
            // chlor NOT installed
            response.text = 'FAIL: Chlorinator not enabled.  Set Chlorinator=1 in config.json'
            return Promise.resolve(response)
        }


    }

    function outputSpaByte() {
        return (currentChlorinatorStatus.outputSpaPercent << 1) + currentChlorinatorStatus.installed
    }

    function superChlorinateByte() {

        if (currentChlorinatorStatus.superChlorinate === 1) {
            if (currentChlorinatorStatus.superChlorinateHours >= 1) {
                return 128 + currentChlorinatorStatus.superChlorinateHours
            }
            else {
                // default to 1 hour
                return 129
            }
        }
        else {
            return 0
        }
    }

    function getDesiredChlorinatorOutput() {
        return currentChlorinatorStatus.outputPoolPercent
    }

    function setChlorinatorStatusFromChlorinator(data, counter) {
//TODO: refactor to be a better promise/async return
        var destination, from, currentOutput;
        if (data[container.constants.chlorinatorPacketFields.DEST] === 80) {
            destination = 'Salt cell';
            from = 'Controller'
        } else {
            destination = 'Controller'
            from = 'Salt cell'
        }


        switch (data[container.constants.chlorinatorPacketFields.ACTION]) {
            case 0: //Get status of Chlorinator
            {
                if (container.settings.get('logChlorinator'))
                    container.logger.verbose('Msg# %s   %s --> %s: Please provide status: %s', counter, from, destination, data)

                break;
            }
            case 1: //Response to get status
            {
                if (container.settings.get('logChlorinator'))
                    container.logger.verbose('Msg# %s   %s --> %s: I am here: %s', counter, from, destination, data)

                break;
            }
            case 3: //Response to version
            {
                var name = '';
                var version = data[4];
                for (var i = 5; i <= 20; i++) {
                    name += String.fromCharCode(data[i]);
                }

                if (currentChlorinatorStatus.name !== name && currentChlorinatorStatus.version !== version) {
                    if (container.settings.get('logChlorinator'))
                        container.logger.verbose('Msg# %s   %s --> %s: Chlorinator version (%s) and name (%s): %s', counter, from, destination, version, name, data);
                    currentChlorinatorStatus.name = name
                    currentChlorinatorStatus.version = version
                    container.settings.updateChlorinatorNameAsync(name)
                    container.io.emitToClients('chlorinator')
                }

                break;
            }
            case 17: //Set Generate %
            {
                currentOutput = data[4];
                var superChlorinate
                if (data[4] >= 100) {
                    superChlorinate = 1
                } else {
                    superChlorinate = 0
                }
                if (currentChlorinatorStatus.currentOutput !== currentOutput || currentChlorinatorStatus.superChlorinate !== superChlorinate) {
                    if (container.settings.get('logChlorinator'))
                        container.logger.verbose('Msg# %s   %s --> %s: Set current output to %s %: %s', counter, from, destination, superChlorinate === 1 ? 'Super Chlorinate' : currentOutput, data);
                    currentChlorinatorStatus.currentOutput = currentOutput
                    currentChlorinatorStatus.superChlorinate = superChlorinate
                    container.io.emitToClients('chlorinator')
                }

                break
            }
            case 18: //Response to 17 (set generate %)
            {

                var saltPPM = data[4] * 50;
                var status = chlorinatorStatusStr(data[5])

                if (currentChlorinatorStatus.saltPPM !== saltPPM || currentChlorinatorStatus.status !== status) {
                    if (container.settings.get('logChlorinator'))
                        container.logger.verbose('Msg# %s   %s --> %s: Current Salt level is %s PPM: %s', counter, from, destination, saltPPM, data);
                    currentChlorinatorStatus.saltPPM = saltPPM
                    currentChlorinatorStatus.status = status
                    container.io.emitToClients('chlorinator')

                }

                if (container.settings.get('logChlorinator'))
                    container.logger.debug('Msg# %s   %s --> %s: Current Salt level is %s PPM: %s', counter, from, destination, saltPPM, data);


                break
            }
            case 20: //Get version
            {
                if (container.settings.get('logChlorinator'))
                    container.logger.verbose('Msg# %s   %s --> %s: What is your version?: %s', counter, from, destination, data)
                break
            }
            case 21: //Set Generate %, but value / 10??
            {
                currentOutput = data[6] / 10;

                if (currentChlorinatorStatus.currentOutput !== currentOutput) {
                    if (container.settings.get('logChlorinator'))
                        container.logger.verbose('Msg# %s   %s --> %s: Set current output to %s %: %s', counter, from, destination, currentOutput, data);
                    currentChlorinatorStatus.currentOutput = currentOutput
                    container.io.emitToClients('chlorinator')
                }
                break
            }
            default: {
                /* istanbul ignore next */
                if (container.settings.get('logChlorinator'))
                    container.logger.verbose('Msg# %s   %s --> %s: Other chlorinator packet?: %s', counter, from, destination, data)
            }
        }

        return Promise.resolve()
            .then(function () {
                // need better logic for this.  If we set intellitouch=0 and chlorinator=0 then this will still try to control the chlorinator by writing packets.  Not ideal for purely listening mode.
                if (currentChlorinatorStatus.installed === 0 && container.settings.get('virtual.chlorinatorController') !== 'never') {
                    currentChlorinatorStatus.installed = 1
                    return container.settings.updateChlorinatorInstalledAsync(1)
                        .then(function () {
                            container.chlorinatorController.startChlorinatorController()
                        })
                }
            })

            .then(function () {
                // check and see if we should start the chlorinator virtual controller
                if (currentChlorinatorStatus.name === -1) {
                    if (container.chlorinatorController.isChlorinatorTimerRunning() === 1)
                    // If we see a chlorinator status packet, then request the name, but only if the chlorinator virtual
                    // controller is enabled.  Note that if the Intellichlor is used, it doesn't respond to the following;
                    // it's name will be in the Intellitouch status packet.
                    {
                        container.logger.verbose('Queueing messages to retrieve Salt Cell Name (AquaRite or OEM)')
                        //get salt cell name
                        if (container.settings.get('logPacketWrites')) {
                            container.logger.debug('decode: Queueing packet to retrieve Chlorinator Salt Cell Name: [16, 2, 80, 20, 0]')
                        }
                        container.queuePacket.queuePacket([16, 2, 80, 20, 0]);
                    }


                }
            })

    }


    /*istanbul ignore next */
    if (container.logModuleLoading)
        container.logger.info('Loaded: chlorinator.js')


    return {
        init: init,
        setChlorinatorStatusFromChlorinator: setChlorinatorStatusFromChlorinator,
        getDesiredChlorinatorOutput: getDesiredChlorinatorOutput,
        updateChlorinatorStatusFromController: updateChlorinatorStatusFromController,
        getChlorinatorName: getChlorinatorName,
        getChlorinatorNameByBytes: getChlorinatorNameByBytes,
        getSaltPPM: getSaltPPM,
        getChlorinatorStatus: getChlorinatorStatus,
        setChlorinatorLevelAsync: setChlorinatorLevelAsync,
        setChlorinatorControlledBy: setChlorinatorControlledBy

    }
}
