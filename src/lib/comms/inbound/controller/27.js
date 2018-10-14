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

// Extended Pump Config
module.exports = function(container) {

  /*istanbul ignore next */
  if (container.logModuleLoading)
    container.logger.info('Loading: 27.js')

  var pumpConfig = {}
  var pumpNum;
  var c = container.constants

  var associate_circuit = function(circuitnum) {
    var circuit = {}
    if (circuitnum === 0) {
      circuit.number = 0
      circuit.name = 'none'
      circuit.friendlyName = 'none'
    } else if (circuitnum <= container.circuit.getNumberOfCircuits()) {
      circuit.number = circuitnum
      circuit.name = container.circuit.getCircuitName(circuitnum)
      circuit.friendlyName = container.circuit.getFriendlyName(circuitnum)
    } else {
      circuit.number = circuitnum
      circuit.name = circuit.friendlyName = c.strCircuitFunction[circuitnum]
    }
    return circuit
  }

  var rpmOrGPM = function(high, low, flag, circuit_slot) {

    // decode flag
    var single_flag = (flag & circuit_slot.number) >> (circuit_slot.number - 1) === 0
    if (single_flag === true)
    // GPM
    {
      circuit_slot.flag = 'gpm'
      circuit_slot.gpm = high
    } else {
      circuit_slot.flag = 'rpm'
      circuit_slot.rpm = (high * 256) + low
    }
    return circuit_slot
  }

  function parseVSPump(data) {
    //pumpConfig[pumpNum].unknownconstant_9 = data[c.pumppumpConfigFieldsVS['UNKNOWNCONSTANT_9']]
    //pumpConfig[pumpNum].unused_10 = data[c.pumppumpConfigFieldsVS['UNUSED_10']]
    pumpConfig[pumpNum].circuit_slot = {}
    pumpConfig[pumpNum].circuit_slot[1] = associate_circuit(data[c.pumpConfigFieldsVS['CIRCUIT1']])
    pumpConfig[pumpNum].circuit_slot[2] = associate_circuit(data[c.pumpConfigFieldsVS['CIRCUIT2']])
    pumpConfig[pumpNum].circuit_slot[3] = associate_circuit(data[c.pumpConfigFieldsVS['CIRCUIT3']])
    pumpConfig[pumpNum].circuit_slot[4] = associate_circuit(data[c.pumpConfigFieldsVS['CIRCUIT4']])
    pumpConfig[pumpNum].circuit_slot[5] = associate_circuit(data[c.pumpConfigFieldsVS['CIRCUIT5']])
    pumpConfig[pumpNum].circuit_slot[6] = associate_circuit(data[c.pumpConfigFieldsVS['CIRCUIT6']])
    pumpConfig[pumpNum].circuit_slot[7] = associate_circuit(data[c.pumpConfigFieldsVS['CIRCUIT7']])
    pumpConfig[pumpNum].circuit_slot[8] = associate_circuit(data[c.pumpConfigFieldsVS['CIRCUIT8']])

    pumpConfig[pumpNum].circuit_slot[1].flag = 'rpm'
    pumpConfig[pumpNum].circuit_slot[2].flag = 'rpm'
    pumpConfig[pumpNum].circuit_slot[3].flag = 'rpm'
    pumpConfig[pumpNum].circuit_slot[4].flag = 'rpm'
    pumpConfig[pumpNum].circuit_slot[5].flag = 'rpm'
    pumpConfig[pumpNum].circuit_slot[6].flag = 'rpm'
    pumpConfig[pumpNum].circuit_slot[7].flag = 'rpm'
    pumpConfig[pumpNum].circuit_slot[8].flag = 'rpm'

    pumpConfig[pumpNum].circuit_slot[1].rpm = (data[c.pumpConfigFieldsVS['CIRCUIT1RPMH']] * 256) + data[c.pumpConfigFieldsVS['CIRCUIT1RPML']]
    pumpConfig[pumpNum].circuit_slot[2].rpm = (data[c.pumpConfigFieldsVS['CIRCUIT2RPMH']] * 256) + data[c.pumpConfigFieldsVS['CIRCUIT2RPML']]
    pumpConfig[pumpNum].circuit_slot[3].rpm = (data[c.pumpConfigFieldsVS['CIRCUIT3RPMH']] * 256) + data[c.pumpConfigFieldsVS['CIRCUIT3RPML']]
    pumpConfig[pumpNum].circuit_slot[4].rpm = (data[c.pumpConfigFieldsVS['CIRCUIT4RPMH']] * 256) + data[c.pumpConfigFieldsVS['CIRCUIT4RPML']]
    pumpConfig[pumpNum].circuit_slot[5].rpm = (data[c.pumpConfigFieldsVS['CIRCUIT5RPMH']] * 256) + data[c.pumpConfigFieldsVS['CIRCUIT5RPML']]
    pumpConfig[pumpNum].circuit_slot[6].rpm = (data[c.pumpConfigFieldsVS['CIRCUIT6RPMH']] * 256) + data[c.pumpConfigFieldsVS['CIRCUIT6RPML']]
    pumpConfig[pumpNum].circuit_slot[7].rpm = (data[c.pumpConfigFieldsVS['CIRCUIT7RPMH']] * 256) + data[c.pumpConfigFieldsVS['CIRCUIT7RPML']]
    pumpConfig[pumpNum].circuit_slot[8].rpm = (data[c.pumpConfigFieldsVS['CIRCUIT8RPMH']] * 256) + data[c.pumpConfigFieldsVS['CIRCUIT8RPML']]

    pumpConfig[pumpNum].prime = {
      primingMinutes: data[c.pumpConfigFieldsVS['PRIMINGMINS']],
      rpm: (data[c.pumpConfigFieldsVS['PRIMERPMH']] * 256) + data[c.pumpConfigFieldsVS['PRIMERPML']]
    }
  }

  function parseVSFPump(data) {
    //pumpConfig[pumpNum].unknownconstant_9 = data[c.pumpConfigFieldsVS['UNKNOWNCONSTANT_9']]
    //pumpConfig[pumpNum].unused_10 = data[c.pumpConfigFieldsVS['UNUSED_10']]
    pumpConfig[pumpNum].circuit_slot = {}
    pumpConfig[pumpNum].circuit_slot[1] = associate_circuit(data[c.pumpConfigFieldsVSF['CIRCUIT1']])
    pumpConfig[pumpNum].circuit_slot[2] = associate_circuit(data[c.pumpConfigFieldsVSF['CIRCUIT2']])
    pumpConfig[pumpNum].circuit_slot[3] = associate_circuit(data[c.pumpConfigFieldsVSF['CIRCUIT3']])
    pumpConfig[pumpNum].circuit_slot[4] = associate_circuit(data[c.pumpConfigFieldsVSF['CIRCUIT4']])
    pumpConfig[pumpNum].circuit_slot[5] = associate_circuit(data[c.pumpConfigFieldsVSF['CIRCUIT5']])
    pumpConfig[pumpNum].circuit_slot[6] = associate_circuit(data[c.pumpConfigFieldsVSF['CIRCUIT6']])
    pumpConfig[pumpNum].circuit_slot[7] = associate_circuit(data[c.pumpConfigFieldsVSF['CIRCUIT7']])
    pumpConfig[pumpNum].circuit_slot[8] = associate_circuit(data[c.pumpConfigFieldsVSF['CIRCUIT8']])

    pumpConfig[pumpNum].circuit_slot[1] = rpmOrGPM(data[c.pumpConfigFieldsVSF['CIRCUIT1H']], data[c.pumpConfigFieldsVSF['CIRCUIT1RPML']], data[c.pumpConfigFieldsVSF['RPMGPMFLAG']], pumpConfig[pumpNum].circuit_slot[1])

    pumpConfig[pumpNum].circuit_slot[2] = rpmOrGPM(data[c.pumpConfigFieldsVSF['CIRCUIT2H']], data[c.pumpConfigFieldsVSF['CIRCUIT2RPML']], data[c.pumpConfigFieldsVSF['RPMGPMFLAG']], pumpConfig[pumpNum].circuit_slot[2])

    pumpConfig[pumpNum].circuit_slot[3] = rpmOrGPM(data[c.pumpConfigFieldsVSF['CIRCUIT3H']], data[c.pumpConfigFieldsVSF['CIRCUIT3RPML']], data[c.pumpConfigFieldsVSF['RPMGPMFLAG']], pumpConfig[pumpNum].circuit_slot[3])

    pumpConfig[pumpNum].circuit_slot[4] = rpmOrGPM(data[c.pumpConfigFieldsVSF['CIRCUIT4H']], data[c.pumpConfigFieldsVSF['CIRCUIT4RPML']], data[c.pumpConfigFieldsVSF['RPMGPMFLAG']], pumpConfig[pumpNum].circuit_slot[4])

    pumpConfig[pumpNum].circuit_slot[5] = rpmOrGPM(data[c.pumpConfigFieldsVSF['CIRCUIT5H']], data[c.pumpConfigFieldsVSF['CIRCUIT5RPML']], data[c.pumpConfigFieldsVSF['RPMGPMFLAG']], pumpConfig[pumpNum].circuit_slot[5])

    pumpConfig[pumpNum].circuit_slot[6] = rpmOrGPM(data[c.pumpConfigFieldsVSF['CIRCUIT6H']], data[c.pumpConfigFieldsVSF['CIRCUIT6RPML']], data[c.pumpConfigFieldsVSF['RPMGPMFLAG']], pumpConfig[pumpNum].circuit_slot[6])

    pumpConfig[pumpNum].circuit_slot[7] = rpmOrGPM(data[c.pumpConfigFieldsVSF['CIRCUIT7H']], data[c.pumpConfigFieldsVSF['CIRCUIT7RPML']], data[c.pumpConfigFieldsVSF['RPMGPMFLAG']], pumpConfig[pumpNum].circuit_slot[7])

    pumpConfig[pumpNum].circuit_slot[8] = rpmOrGPM(data[c.pumpConfigFieldsVSF['CIRCUIT8H']], data[c.pumpConfigFieldsVSF['CIRCUIT8RPML']], data[c.pumpConfigFieldsVSF['RPMGPMFLAG']], pumpConfig[pumpNum].circuit_slot[8])
  }

  function parseVFPump(data) {

    pumpConfig[pumpNum].backgroundCircuit = pumpConfig[pumpNum].type
    pumpConfig[pumpNum].type = 'VF'

    //pumpConfig[pumpNum].unknownconstant_9 = data[c.pumpConfigFieldsVS['UNKNOWNCONSTANT_9']]
    //pumpConfig[pumpNum].unused_10 = data[c.pumpConfigFieldsVS['UNUSED_10']]
    pumpConfig[pumpNum].circuit_slot = {}
    pumpConfig[pumpNum].circuit_slot[1] = associate_circuit(data[c.pumpConfigFieldsVF['CIRCUIT1']])
    pumpConfig[pumpNum].circuit_slot[2] = associate_circuit(data[c.pumpConfigFieldsVF['CIRCUIT2']])
    pumpConfig[pumpNum].circuit_slot[3] = associate_circuit(data[c.pumpConfigFieldsVF['CIRCUIT3']])
    pumpConfig[pumpNum].circuit_slot[4] = associate_circuit(data[c.pumpConfigFieldsVF['CIRCUIT4']])
    pumpConfig[pumpNum].circuit_slot[5] = associate_circuit(data[c.pumpConfigFieldsVF['CIRCUIT5']])
    pumpConfig[pumpNum].circuit_slot[6] = associate_circuit(data[c.pumpConfigFieldsVF['CIRCUIT6']])
    pumpConfig[pumpNum].circuit_slot[7] = associate_circuit(data[c.pumpConfigFieldsVF['CIRCUIT7']])
    pumpConfig[pumpNum].circuit_slot[8] = associate_circuit(data[c.pumpConfigFieldsVF['CIRCUIT8']])

    pumpConfig[pumpNum].circuit_slot[1].flag = 'gpm'
    pumpConfig[pumpNum].circuit_slot[2].flag = 'gpm'
    pumpConfig[pumpNum].circuit_slot[3].flag = 'gpm'
    pumpConfig[pumpNum].circuit_slot[4].flag = 'gpm'
    pumpConfig[pumpNum].circuit_slot[5].flag = 'gpm'
    pumpConfig[pumpNum].circuit_slot[6].flag = 'gpm'
    pumpConfig[pumpNum].circuit_slot[7].flag = 'gpm'
    pumpConfig[pumpNum].circuit_slot[8].flag = 'gpm'

    pumpConfig[pumpNum].circuit_slot[1].gpm = data[c.pumpConfigFieldsVF['CIRCUIT1GPM']]
    pumpConfig[pumpNum].circuit_slot[2].gpm = data[c.pumpConfigFieldsVF['CIRCUIT2GPM']]
    pumpConfig[pumpNum].circuit_slot[3].gpm = data[c.pumpConfigFieldsVF['CIRCUIT3GPM']]
    pumpConfig[pumpNum].circuit_slot[4].gpm = data[c.pumpConfigFieldsVF['CIRCUIT4GPM']]
    pumpConfig[pumpNum].circuit_slot[5].gpm = data[c.pumpConfigFieldsVF['CIRCUIT5GPM']]
    pumpConfig[pumpNum].circuit_slot[6].gpm = data[c.pumpConfigFieldsVF['CIRCUIT6GPM']]
    pumpConfig[pumpNum].circuit_slot[7].gpm = data[c.pumpConfigFieldsVF['CIRCUIT7GPM']]
    pumpConfig[pumpNum].circuit_slot[8].gpm = data[c.pumpConfigFieldsVF['CIRCUIT8GPM']]

    pumpConfig[pumpNum].filtering = {}
    pumpConfig[pumpNum].filtering.filter = {}
    pumpConfig[pumpNum].filtering.filter.poolSize = data[c.pumpConfigFieldsVF['POOLSIZE']]*1000
    pumpConfig[pumpNum].filtering.filter.turnOvers = data[c.pumpConfigFieldsVF['TURNOVERS']]
    pumpConfig[pumpNum].filtering.filter.manualFilterGPM = data[c.pumpConfigFieldsVF['MANUALFILTERGPM']]

    pumpConfig[pumpNum].filtering.vacuum = {}
    pumpConfig[pumpNum].filtering.vacuum.flow = data[c.pumpConfigFieldsVF['VACUUMFLOW']]+1
    pumpConfig[pumpNum].filtering.vacuum.time = data[c.pumpConfigFieldsVF['VACUUMTIME']]

    pumpConfig[pumpNum].filtering.priming = {}
    pumpConfig[pumpNum].filtering.priming.maxFlow = data[c.pumpConfigFieldsVF['MAXPRIMEFLOW']]
    pumpConfig[pumpNum].filtering.priming.maxTime = data[c.pumpConfigFieldsVF['MAXPRIMESYSTEMTIME']] & 15 //mask lower 4 bits
    pumpConfig[pumpNum].filtering.priming.systemMaxTime = data[c.pumpConfigFieldsVF['MAXPRIMESYSTEMTIME']] >> 4 // higher 4 bits

    pumpConfig[pumpNum].filtering.backwash = {}
    pumpConfig[pumpNum].filtering.backwash.maxPressureIncrease = data[c.pumpConfigFieldsVF['MAXPRESSUREINCREASE']]
    pumpConfig[pumpNum].filtering.backwash.flow = data[c.pumpConfigFieldsVF['BACKWASHFLOW']]
    pumpConfig[pumpNum].filtering.backwash.time = data[c.pumpConfigFieldsVF['BACKWASHTIME']]
    pumpConfig[pumpNum].filtering.backwash.rinseTime = data[c.pumpConfigFieldsVF['RINSETIME']]


  }


  function process(data, counter) {


    if (container.settings.get('logPumpMessages'))
      container.logger.debug('Msg# %s   Pump Config (Extended) status packet: %s', counter, data)


    pumpNum = data[c.pumpConfigFieldsCommon['NUMBER']]
    if (!pumpConfig.hasOwnProperty(pumpNum)) {
      pumpConfig[pumpNum] = {}
    }
    pumpConfig[pumpNum].type = c.pumpTypeStr[data[c.pumpConfigFieldsCommon['TYPE']]]



    if (pumpConfig[pumpNum].type === 'NONE') {
       // console.log('######  NONE')
    } else if (pumpConfig[pumpNum].type === 'VS') {
      parseVSPump(data);
    } else if (pumpConfig[pumpNum].type === 'VSF') {
      parseVSFPump(data);
    } else
    // pump type is VF
    {
      parseVFPump(data);
    }

    container.logger.info("Discovered pump configurations: %s", JSON.stringify(pumpConfig, null, 2))

    return true
  }


  /*istanbul ignore next */
  if (container.logModuleLoading)
    container.logger.info('Loaded: 27.js')


  return {
    process: process
  }
}
