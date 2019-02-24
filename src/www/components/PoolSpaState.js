import {
    Row, Col, Button, ButtonGroup
} from 'reactstrap';

import CustomCard from './CustomCard'

import Slider from 'react-rangeslider'
import 'react-rangeslider/lib/index.css'

import { setHeatMode, setHeatSetPoint, toggleCircuit } from '../components/Socket_Client'
import React from 'react'



class PoolSpaState extends React.Component {

    constructor(props) {
        super(props)


        this.state = {
            setPoint: 0

        }

        this.changeHeat = this.changeHeat.bind(this)
        this.handleOnOffClick = this.handleOnOffClick.bind(this)
        //console.log(`evaling state.setpoint`)
        if (this.state.setPoint !== this.props.data.setPoint) {
            this.setState({ setPoint: this.props.data.setPoint })
        }


    }


    changeHeat = mode => {

        //console.log(`changing ${mode} for ${this.props.data.name}`)
        setHeatMode(this.props.data.name, mode)
    }

    changeSetPointVal = (setPoint) => {
        if (this.state.setPoint !== setPoint) {

            //console.log(`setPoint change! ${setPoint}`)
            this.setState({
                setPoint: setPoint
            });
        }
    };

    changeSetPointComplete = () => {
        console.log(`changing ${this.state.setPoint} for ${this.props.data.name}`)
        setHeatSetPoint(this.props.data.name, this.state.setPoint)
    }

    handleOnOffClick = () => {
        toggleCircuit(this.props.data.number)
    }

    render() {

        const low = 50;
        const high = 110;
        const labelStr = `{"${low}": "${low}", "${high}": "${high}"}`
        let labels = JSON.parse(labelStr)


        return (
            <div>
                <a name={this.props.data.name} className="anchor"></a>
                <CustomCard name={this.props.data.name}>
                    <Row>
                        <Col>Pool State
                                </Col>
                        <Col>
                        <Button color={this.props.data.state==='On'?'success':'primary'}
                        onClick={this.handleOnOffClick}
                        >
                        {this.props.data.state}
                        </Button>
                         
                        </Col>
                    </Row>


                    <Row>
                        <Col>Temp</Col>
                        <Col >
                            {this.props.data.temp}
                        </Col>
                    </Row>
                    <Row>
                        <Col>
                            <Slider className='slider custom-labels'
                                min={low}
                                max={high}
                                labels={labels}
                                value={this.state.setPoint === 0 ? this.props.data.setPoint : this.state.setPoint}
                                onChange={this.changeSetPointVal}
                                onChangeComplete={this.changeSetPointComplete}
                            />
                            <div className='text-center'>
                                Set Point: {this.props.data.setPoint}
                            </div>
                        </Col>
                    </Row>
                    <Row>
                        <Col>
                            Heater Mode
                                <div className='d-flex justify-content-center'>
                                <ButtonGroup >
                                    <Button onClick={() => this.changeHeat(0)} color={this.props.data.heatMode === 0 ? 'success' : 'secondary'}>Off</Button>
                                    <Button onClick={() => this.changeHeat(1)} color={this.props.data.heatMode === 1 ? 'success' : 'secondary'}>Heater</Button>
                                    <Button onClick={() => this.changeHeat(2)} color={this.props.data.heatMode === 2 ? 'success' : 'secondary'}>Solar Pref</Button>
                                    <Button onClick={() => this.changeHeat(3)} color={this.props.data.heatMode === 3 ? 'success' : 'secondary'}>Solar</Button>
                                </ButtonGroup>
                            </div>
                        </Col>
                    </Row>
                </CustomCard>
            </div>
        );
    }
}

export default PoolSpaState;