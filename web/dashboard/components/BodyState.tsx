import * as React from 'react';
import
{
    Row, Col, Button, ButtonGroup, ListGroup, ListGroupItem
} from 'reactstrap';
import CustomCard from './CustomCard'
import Slider from 'react-rangeslider'
import 'react-rangeslider/lib/index.css'
import { setHeatMode, setHeatSetPoint, toggleCircuit } from './Socket_Client'
import { IDetail, IStateTempBodyDetail } from './PoolController';
const flame = require( '../images/flame.png' );

interface Props
{
    UOM: IDetail;
    id: string;
    visibility: string;
    data: IStateTempBodyDetail[];
}
class BodyState extends React.Component<Props, any>
{
    constructor( props: Props )
    {
        super( props )
        this.state = {
            setPointBody1: 0,
            setPointBody2: 0,
            setPointBody3: 0,
            setPointBody4: 0
        }
        this.changeHeat = this.changeHeat.bind( this );
        this.handleOnOffClick = this.handleOnOffClick.bind( this );
        this.changeSetPointVal = this.changeSetPointVal.bind( this );
        this.changeSetPointComplete = this.changeSetPointComplete.bind( this );
    }
    changeHeat = ( id: number, mode: number ) =>
    {
        setHeatMode( id, mode )
    }
    changeSetPointVal = ( setPoint: number, body: number ) =>
    {
        if ( this.state[ 'setPointBody' + body ] !== setPoint )
        {
            this.setState( {
                [ 'setPointBody' + body ]: setPoint
            } );
        }
    };
    changeSetPointComplete = ( body: number ) =>
    {
        setHeatSetPoint( body, this.state[ 'setPointBody' + body ] )
    }
    handleOnOffClick = ( event: any ) =>
    {
        toggleCircuit( event.target.value )
    }
    componentDidMount ()
    {
        console.log( `this.props` )
        console.log( this.props )
        if ( this.props.data.length && typeof this.props.data !== 'undefined' )
            if ( this.state.setPoint !== this.props.data[ 0 ].setPoint )
            {
                this.setState( { setPoint: this.props.data[ 0 ].setPoint } );
            }
    }
    bodyDisplay = () =>
    {
        return this.props.data.map( body =>
        {
            const low = this.props.UOM.val === 0 ? 50 : 10;
            const high = this.props.UOM.val === 0 ? 104 : 43;
            const labelStr = `{"${ low }": "${ low }", "${ high }": "${ high }"}`
            let labels = JSON.parse( labelStr )
            const showFlameSolar = () =>
            {
                if ( body.isOn && body.heatStatus.val === 2 )
                {
                    return ( <img src={flame} /> )
                }
            }
            const showFlameHeater = () =>
            {
                if ( body.isOn && body.heatStatus.val === 1 )
                {
                    return ( <img src={flame} /> )
                }
            }
            return ( <ListGroupItem key={body.id + 'BodyKey'}> <Row>
                <Col>{body.name}
                </Col>
                <Col>
                    <Button color={body.isOn ? 'success' : 'primary'}
                        onClick={this.handleOnOffClick} value={body.circuit}  >
                        {body.isOn ? "On" : "Off"}
                    </Button>

                </Col>
            </Row>
                <Row>
                    <Col>Temp</Col>
                    <Col >
                        {body.temp}
                        {body.isOn ? `` : ` (Last)`}
                    </Col>
                </Row>
                <Row>
                    <Col>

                        <Slider
                            min={low}
                            max={high}
                            labels={labels}
                            value={this.state[ 'setPointBody' + body.id ] === 0 ? body.setPoint : this.state[ 'setPointBody' + body.id ]}
                            data-bodyid={body.id}
                            onChange={( setPoint ) => this.changeSetPointVal( setPoint, body.id )}
                            onChangeComplete={() => this.changeSetPointComplete( body.id )}
                        />
                        <div className='text-center'>
                            Set Point: {body.setPoint}
                        </div>
                    </Col>
                </Row>
                <Row>
                    <Col>
                        Heater Mode
                                <div className='d-flex justify-content-center'>
                            <ButtonGroup >
                                <Button onClick={() => this.changeHeat( body.id, 0 )} color={body.heatMode.val === 0 ? 'success' : 'secondary'}>Off</Button>
                                <Button onClick={() => this.changeHeat( body.id, 3 )} color={body.heatMode.val === 3 ? 'success' : 'secondary'}>Heater{' '}{showFlameHeater()}</Button>
                                <Button onClick={() => this.changeHeat( body.id, 21 )} color={body.heatMode.val === 21 ? 'success' : 'secondary'}>Solar Pref</Button>
                                <Button onClick={() => this.changeHeat( body.id, 5 )} color={body.heatMode.val === 5 ? 'success' : 'secondary'}>Solar{' '}{showFlameSolar()}</Button>
                            </ButtonGroup>
                        </div>
                    </Col>
                </Row>
            </ListGroupItem>
            )
        } )
    }
    render ()
    {
        return (
            <div className='tab-pane active' id={this.props.id} role="tabpanel" aria-labelledby={this.props.id + '-tab'} >
                <CustomCard name={( this.props.data.length === 1 ? 'Body' : 'Bodies' ) + ' (count=' + this.props.data.length + ')'} id={this.props.id} visibility={this.props.visibility}>
                    <ListGroup flush >
                        {this.bodyDisplay()}
                    </ListGroup>
                </CustomCard>
            </div>
        )
    }
}

export default BodyState;