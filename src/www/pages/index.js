import React, { Component } from 'react';
import { getAll } from '../components/Socket_Client';
import Layout from '../components/Layout';
import { Button } from 'reactstrap';
import SysInfo from '../components/SysInfo'
import PoolSpaState from '../components/PoolSpaState'
import Pump from '../components/Pump'

class App extends Component {
    constructor(props) {
        super(props);

        getAll((err, d) => {

            this.setState({ data: Object.assign({}, this.state.data, d) })
            this.setState(
                (state) => { return { config: d.config } })
            this.setState((state) => { return { circuit: d.circuit } })
            this.setState((state) => { return { pump: d.pump } })

            this.setState((state) => { return { schedule: d.schedule } })
            this.setState((state) => { return { temperature: d.temperature } })
            this.setState((state) => { return { time: d.time } })
            this.setState((state) => { return { UOM: d.UOM } })
            this.setState((state) => { return { valve: d.valve } })
            this.setState((state) => { return { chlorinator: d.chlorinator } })
            this.setState((state) => { return { intellichem: d.intellichem } })

            this.setState((state) => {
                return {
                    sysInfo: {
                        time: d.time.controllerTime,
                        date: d.time.controllerDateStr,
                        locale: d.time.locale,
                        airTemp: d.temperature.airTemp,
                        solarTemp: d.temperature.solarTemp,
                        freezeProt: d.temperature.freeze
                    },
                    poolInfo: {
                        name: "Pool",
                        state: this.circuitOn("Pool")?"On":"Off",
                        temp: d.temperature.poolTemp,
                        setPoint: d.temperature.poolSetPoint,
                        heatMode: d.temperature.poolHeatMode,
                        heatModeStr: d.temperature.poolHeatModeStr,
                        heatOn: d.temperature.heaterActive
                    },
                    spaInfo: {
                        name: "Spa",
                        state: this.circuitOn("Spa")?"On":"Off",
                        temp: d.temperature.spaTemp,
                        setPoint: d.temperature.spaSetPoint,
                        heatMode: d.temperature.spaHeatMode,
                        heatModeStr: d.temperature.spaHeatModeStr,
                        heatOn: d.temperature.heaterActive
                    }
                }
            })

        }
        );

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
                    console.log(`${n.circuitFunction} is ${n.status}`)
                    return true
                }
            }
        })
        console.log(`res: ${JSON.stringify(results)}`)
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
        poolInfo: {name: 'n/a'},
        spaInfo: {name: 'n/a'},
        pump: {1: {}}
    }





    render() {
        return (
            <Layout>
                <div className="App">

                    <header >
                        <h1 >Welcome to React</h1>
                    </header>
                    <p>

                    </p><p>
                        Data ready?: {this.state.config.systemReady}
                    </p></div>

                <SysInfo
                    value={this.state.sysInfo} />
                    
              <PoolSpaState data={this.state.poolInfo} /> 
              <PoolSpaState data={this.state.spaInfo} /> 
             
              <Pump data={this.state.pump} />
            </Layout>
        );
    }
}

export default App;