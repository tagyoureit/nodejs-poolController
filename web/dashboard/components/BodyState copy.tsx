import * as React from 'react';
import
{
    Row, Col, Button, ButtonGroup
} from 'reactstrap';
import CustomCard from './CustomCard'
import Slider from 'react-rangeslider'
import 'react-rangeslider/lib/index.css'
import { setHeatMode, setHeatSetPoint, toggleCircuit } from './Socket_Client'
import { IDetail, IStateCircuit, IStateTempBodyDetail } from './PoolController';
const  flame  = require('../images/flame.png');

interface Props
{
    circuit: IStateCircuit;
    UOM: IDetail;
    id: string;
    visibility: string;
    tempData: IStateTempBodyDetail
}
class BodyState extends React.Component<Props, any>
{

    constructor( props: Props )
    {
        super( props )


        this.state = {
            setPoint: 0
        }

        this.changeHeat = this.changeHeat.bind( this )
        this.handleOnOffClick = this.handleOnOffClick.bind( this )
    }


    changeHeat = (mode: number) =>
    {
        setHeatMode( this.props.id === 'spa' ? 0 : 1, mode )
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
        setHeatSetPoint( this.props.id==='spa'?0:1, this.state.setPoint )
    }

    handleOnOffClick = (event: any) =>
    {
        try
        {
            toggleCircuit( event.target.value )
        }
        catch ( err )
        {
            console.log(`Not emitting from ${this.props.tempData.name} because we do not know the circuit number yet.`)
        }
    }

    componentDidMount ()
    {
        console.log( `this.props` )
        console.log(this.props)
        if ( typeof this.props.tempData !=='undefined' &&this.state.setPoint !== this.props.tempData.setPoint )
        {
            this.setState( { setPoint: this.props.tempData.setPoint } );
        }
    }

    render ()
    {
        const low = this.props.UOM.val===0?50:10;
        const high = this.props.UOM.val===0?110:43;
        const labelStr = `{"${ low }": "${ low }", "${ high }": "${ high }"}`
        let labels = JSON.parse( labelStr )
        const showFlameSolar = () =>
        {
            if ( this.props.tempData.isOn && this.props.tempData.heatStatus.val===2 )
            {
                return (<img src={flame} />)
            }
        }
        const showFlameHeater = () =>
        {
            if ( this.props.tempData.isOn && this.props.tempData.heatStatus.val===1 )
            {
                return (<img src={flame} />)
            }
        }
        if (typeof this.props.tempData!=='undefined')
        return (
            <div className='tab-pane active' id={this.props.id} role="tabpanel" aria-labelledby={this.props.id + '-tab'} >
                <CustomCard name={this.props.tempData.name} id={this.props.id} visibility={this.props.visibility}>
                    <Row>
                        <Col>{this.props.tempData.name} State
                                </Col>
                        <Col>
                            <Button color={this.props.tempData.isOn ? 'success' : 'primary'}
                                onClick={this.handleOnOffClick} value={this.props.tempData.circuit}
                            >
                                {this.props.tempData.isOn?"On":"Off"}
                            </Button>

                        </Col>
                    </Row>
                    <Row>
                        <Col>Temp</Col>
                        <Col >
                            {this.props.tempData.temp}
                            {this.props.tempData.isOn?``:` (Last)`}
                        </Col>
                    </Row>
                    <Row>
                        <Col>
                            {/* <Slider className='slider custom-labels' */}
                            <Slider
                                min={low}
                                max={high}
                                labels={labels}
                                value={this.state.setPoint === 0 ? this.props.tempData.setPoint : this.state.setPoint}
                                onChange={this.changeSetPointVal}
                                onChangeComplete={this.changeSetPointComplete}
                            />
                            <div className='text-center'>
                                Set Point: {this.props.tempData.setPoint}
                            </div>
                        </Col>
                    </Row>
                    <Row>
                        <Col>
                            Heater Mode
                                <div className='d-flex justify-content-center'>
                                <ButtonGroup >
                                    <Button onClick={() => this.changeHeat( 0 )} color={this.props.tempData.heatMode.val === 0 ? 'success' : 'secondary'}>Off</Button>
                                    <Button onClick={() => this.changeHeat( 3 )} color={this.props.tempData.heatMode.val === 3 ? 'success' : 'secondary'}>Heater{' '}{showFlameHeater()}</Button>
                                    <Button onClick={() => this.changeHeat( 21 )} color={this.props.tempData.heatMode.val === 21 ? 'success' : 'secondary'}>Solar Pref</Button>
                                    <Button onClick={() => this.changeHeat( 5 )} color={this.props.tempData.heatMode.val === 5 ? 'success' : 'secondary'}>Solar{' '}{showFlameSolar()}</Button>
                                </ButtonGroup>
                            </div>
                        </Col>
                    </Row>
                </CustomCard>
            </div>
        )
        else 
            return (<div/>)
    }
}

export default BodyState;