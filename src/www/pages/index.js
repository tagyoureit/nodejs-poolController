import React, { Component } from 'react';
import { getAll } from '../components/Socket_Client';
import Layout from '../components/Layout';
import { Button } from 'reactstrap';
import SysInfo from '../components/SysInfo'


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
                return {sysInfo : {
                    time: d.time.controllerTime,
                    date: d.time.controllerDateStr,
                    locale: d.time.locale,
                    airTemp: d.temperature.airTemp,
                    solarTemp: d.temperature.solarTemp,
                    freezeProt: d.temperature.freeze
                }}
            })




            // this.setState({ pump: Object.assign({}, this.state.pump, d.pump) })
            // this.setState({ schedule: Object.assign({}, this.state.schedule, d.schedule) })
            // this.setState({ temperature: Object.assign({}, this.state.temperature, d.temperature) })
            // this.setState({ time: Object.assign({}, this.state.time, d.time) })
            // this.setState({ UOM: Object.assign({}, this.state.UON, d.UOM) })
            // this.setState({ valve: Object.assign({}, this.state.valve, d.valve) })
            // this.setState({ chlorinator: Object.assign({}, this.state.chlorinator, d.chlorinator) })
            // this.setState({ intellichem: Object.assign({}, this.state.intellichem, d.intellichem) })

            // this.setState((state) => {
            //     return {quantity: state.quantity + 1};
            //   });

        }
        );

    }



    state = {
        //need these lines if we are to immediately output them... not sure why
        // otherwise, can probably pass them as props
        config: { systemReady: 0 },
        circuit: {},
        time: { controllerTime: 'none' },
        temperature: { airTemp: 0, poolTemp: 0 },
        sysInfo: {}
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
                    value={this.state.sysInfo}/>
            </Layout>
        );
    }
}

export default App;