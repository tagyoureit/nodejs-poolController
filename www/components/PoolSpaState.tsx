import * as React from 'react';
import
{
    Row, Col, Button, ButtonGroup
} from 'reactstrap';
import CustomCard from './CustomCard'
import Slider from 'react-rangeslider'
import 'react-rangeslider/lib/index.css'
import { setHeatMode, setHeatSetPoint, toggleCircuit } from '../components/Socket_Client'

interface Props
{
    data: WWW.IPoolOrSpaState;
    UOM: IUOM.UOM;
    id: string;
    visibility: string;
}
class PoolSpaState extends React.Component<Props, any>
{

    constructor( props: Props )
    {
        super( props )


        this.state = {
            setPoint: 0

        }

        this.changeHeat = this.changeHeat.bind( this )
        this.handleOnOffClick = this.handleOnOffClick.bind( this )
        if ( this.state.setPoint !== this.props.data.setPoint )
        {
            this.setState( { setPoint: this.props.data.setPoint } )
        }
    }


    changeHeat = (mode: number) =>
    {
        setHeatMode( this.props.data.name, mode )
    }

    changeSetPointVal = ( setPoint: number ) =>
    {
        if ( this.state.setPoint !== setPoint )
        {
            this.setState( {
                setPoint: setPoint
            } );
        }
    };

    changeSetPointComplete = () =>
    {
        setHeatSetPoint( this.props.data.name, this.state.setPoint )
    }

    handleOnOffClick = (event: any) =>
    {
        try
        {
            toggleCircuit( event.target.value )
        }
        catch ( err )
        {
            console.log(`Not emitting from ${this.props.data.name} because we do not know the circuit number yet.`)
        }
    }

 

    render ()
    {

        const low = this.props.UOM.UOM==='F'?50:10;
        const high = this.props.UOM.UOM==='F'?110:43;
        const labelStr = `{"${ low }": "${ low }", "${ high }": "${ high }"}`
        let labels = JSON.parse( labelStr )
        const showFlameSolar = () =>
        {
            if ( this.props.data.state === "On" && this.props.data.solarActive )
            {
                return (<img src='../images/flame.png' />)
            }
        }
        const showFlameHeater = () =>
        {
            if ( this.props.data.state === "On" && this.props.data.heaterActive )
            {
                return (<img src='../images/flame.png' />)
            }
        }

        return (
            <div className='tab-pane active' id={this.props.id} role="tabpanel" aria-labelledby={this.props.id + '-tab'} >
                <CustomCard name={this.props.data.name} id={this.props.id} visibility={this.props.visibility}>
                    <Row>
                        <Col>{this.props.data.name} State
                                </Col>
                        <Col>
                            <Button color={this.props.data.state === 'On' ? 'success' : 'primary'}
                                onClick={this.handleOnOffClick} value={this.props.data.number}
                            >
                                {this.props.data.state}
                            </Button>

                        </Col>
                    </Row>


                    <Row>
                        <Col>Temp</Col>
                        <Col >
                            {this.props.data.state==='On'?this.props.data.temperature:`${this.props.data.lastKnownTemperature} (Last)`}
                        </Col>
                    </Row>
                    <Row>
                        <Col>
                            {/* <Slider className='slider custom-labels' */}
                            <Slider
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
                                    <Button onClick={() => this.changeHeat( 0 )} color={this.props.data.heatMode === 0 ? 'success' : 'secondary'}>Off</Button>
                                    <Button onClick={() => this.changeHeat( 1 )} color={this.props.data.heatMode === 1 ? 'success' : 'secondary'}>Heater{' '}{showFlameHeater()}</Button>
                                    <Button onClick={() => this.changeHeat( 2 )} color={this.props.data.heatMode === 2 ? 'success' : 'secondary'}>Solar Pref</Button>
                                    <Button onClick={() => this.changeHeat( 3 )} color={this.props.data.heatMode === 3 ? 'success' : 'secondary'}>Solar{' '}{showFlameSolar()}</Button>
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