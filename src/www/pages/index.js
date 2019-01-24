import React, { Component } from 'react';
import { getAll } from '../components/Socket_Client';
import Layout from '../components/Layout';
import SysInfo from '../components/SysInfo'
import PoolSpaState from '../components/PoolSpaState'
import Pump from '../components/Pump'
import Features from '../components/Features'
import Schedule from '../components/Schedule'
import EggTimer from '../components/EggTimer'


class NodeJSPoolController extends Component {
    constructor(props) {
        super(props);

        let lastUpdateTime = 0;


        getAll((err, d, which) => {

            if (lastUpdateTime - Date.now() > 300) {
                this.setState((state) => {
                    return {
                        counter: state.counter++
                    }
                }
                )
                lastUpdateTime = Date.now()
            }
            else {
                //console.log(`Throttling...`)
            }

            //console.log(`GETALL CALLED! with ${which}`)
            if (err) {
                console.log(`socket getall err: ${err}`)
            }

            if (which === 'config' || which === 'all') {
                this.setState(
                    (state) => { return { config: d.config } })
            }

            if (which === 'circuit' || which === 'all') {
                //console.log('circuit socket')
                this.setState((state) => {
                    return {
                        circuit: d.circuit,
                        features: this.circuitsWithoutPoolSpa(d.circuit)
                    }
                })

            }

            if (which === 'pump' || which === 'all') {
                this.setState((state) => { return { pump: d.pump } })
            }

            if (which === 'schedule' || which === 'all') {
                this.setState((state) => {
                    return {
                        schedule: this.scheduleEntries(d.schedule),
                        eggTimer: this.eggTimerEntries(d.schedule)
                    }
                })
            }

            if (which === 'temperature' || which === 'all') {
                this.setState((state) => {
                    return {
                        temperature: d.temperature,
                        poolInfo: {
                            ...state.poolInfo, temp: d.temperature.poolTemp,
                            setPoint: d.temperature.poolSetPoint,
                            heatMode: d.temperature.poolHeatMode,
                            heatModeStr: d.temperature.poolHeatModeStr,
                            heatOn: d.temperature.heaterActive
                        },
                        spaInfo: {
                            ...state.spaInfo, temp: d.temperature.spaTemp,
                            setPoint: d.temperature.spaSetPoint,
                            heatMode: d.temperature.spaHeatMode,
                            heatModeStr: d.temperature.spaHeatModeStr,
                            heatOn: d.temperature.heaterActive
                        }

                    }
                })
            }

            if (which === 'time' || which === 'all') {
                this.setState((state) => { return { time: d.time } })
            }


            if (which === 'UOM') {
                this.setState((state) => { return { UOM: d.UOM } })
            }

            if (which === 'valve') {
                this.setState((state) => { return { valve: d.valve } })
            }

            if (which === 'chlorinator') {
                this.setState((state) => { return { chlorinator: d.chlorinator } })
            }

            if (which === 'intellichem') {
                this.setState((state) => { return { intellichem: d.intellichem } })
            }

            if (which === 'all') {
                this.setState((state) => {
                    return {
                        data: Object.assign({}, this.state.data, d)
                    }
                })

            }


            if (d.time && d.temperature) {
                this.setState((state) => {
                    return {
                        sysInfo: {
                            time: d.time.controllerTime,
                            date: d.time.controllerDateStr,
                            locale: d.time.locale,
                            airTemp: d.temperature.airTemp,
                            solarTemp: d.temperature.solarTemp,
                            freezeProt: d.temperature.freeze
                        }
                    }
                })
            }

            if (d.temperature) {
                this.setState((state) => {
                    return {
                        poolInfo: {
                            name: "Pool",
                            state: this.circuitOn("Pool") ? "On" : "Off",
                            temp: d.temperature.poolTemp,
                            setPoint: d.temperature.poolSetPoint,
                            heatMode: d.temperature.poolHeatMode,
                            heatModeStr: d.temperature.poolHeatModeStr,
                            heatOn: d.temperature.heaterActive
                        },
                        spaInfo: {
                            name: "Spa",
                            state: this.circuitOn("Spa") ? "On" : "Off",
                            temp: d.temperature.spaTemp,
                            setPoint: d.temperature.spaSetPoint,
                            heatMode: d.temperature.spaHeatMode,
                            heatModeStr: d.temperature.spaHeatModeStr,
                            heatOn: d.temperature.heaterActive
                        }
                    }
                })
            }

            //console.log(`date.now ${Date.now()}... date-last: ${Date.now()-lastUpdateTime}`)
            if (Date.now() - lastUpdateTime > 1000) {
                lastUpdateTime = Date.now()
                // set counter +1 for resetting time keeping
                this.setState((state) => {
                    return { counter: state.counter + 1 }
                })
            }



        })

    }


    scheduleEntries(schedule) {
        const entries = Object.keys(schedule)
        //console.log(entries[1][1].name)
        const filter = entries.filter(key => !(schedule[key].CIRCUITNUM === 0 || schedule[key].MODE === 'Egg Timer')
        )
        //console.log(filter)

        const obj = {}
        for (const el of filter) {
            //console.log(`el: ${el}`)
            //console.log(`obj: ${JSON.stringify(obj,null,2)}`)
            obj[el] = schedule[el];
        }
        return obj
    }
    eggTimerEntries(schedule) {
        const entries = Object.keys(schedule)
        //console.log(entries[1][1].name)
        const filter = entries.filter(key => !(schedule[key].CIRCUITNUM === 0 || schedule[key].MODE === 'Schedule')
        )
        //console.log(filter)

        const obj = {}
        for (const el of filter) {
            //console.log(`el: ${el}`)
            //console.log(`obj: ${JSON.stringify(obj,null,2)}`)
            obj[el] = schedule[el];
        }
        return obj
    }

    circuitsWithoutPoolSpa(circuit) {
        const entries = Object.keys(circuit)
        //console.log(entries[1][1].name)
        const filter = entries.filter(key => !(circuit[key].name === 'POOL' || circuit[key].name === 'SPA')
        )
        //console.log(filter)

        const obj = {}
        for (const el of filter) {
            //console.log(`el: ${el}`)
            //console.log(`obj: ${JSON.stringify(obj,null,2)}`)
            obj[el] = circuit[el];
        }
        return obj
    }

    circuitOn(which) {
        // map the obj to an array
        const circuitMap = Object.values(this.state.circuit)
        // loop through the circuits
        const results = circuitMap.filter((n) => {
            // find the Spa or Pool circuit
            if (n.circuitFunction === which) {
                // if the circuit is on return the filtered value in the list
                if (n.status) {
                    //console.log(`${n.circuitFunction} is ${n.status}`)
                    return true
                }
            }
        })
        //console.log(`res: ${JSON.stringify(results)}`)
        // if the list has 1+ "on" entry then the pool/spa pump is on
        return Object.keys(results).length >= 1
    }


    state = {
        //need these lines if we are to immediately output them... not sure why
        // otherwise, can probably pass them as props
        config: { systemReady: 0 },
        circuit: {},
        time: { controllerTime: 'none' },
        temperature: { airTemp: 0, poolTemp: 0 },
        sysInfo: {},
        poolInfo: { name: 'n/a' },
        spaInfo: { name: 'n/a' },
        pump: { 1: {} },
        features: { 1: {} },
        counter: 0
    }

    render() {
        return (
            <Layout counter={this.state.counter}>
                <SysInfo
                    value={this.state.sysInfo} />
                <PoolSpaState data={this.state.poolInfo}></PoolSpaState>
                <PoolSpaState data={this.state.spaInfo}></PoolSpaState>
                <Pump data={this.state.pump} />
                <Features data={this.state.features} />
                <Schedule data={this.state.schedule} />
                <EggTimer data={this.state.eggTimer} />

            </Layout>

        );
    }
}

export default NodeJSPoolController;