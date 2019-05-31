import
{
    Row, Col, Container, Button, ButtonGroup, Nav, NavItem, Dropdown, DropdownItem, DropdownToggle, DropdownMenu, NavLink, ButtonDropdown
} from 'reactstrap';
import * as React from 'react';
import PumpConfigSelectType from './PumpConfigSelectType'
import PumpConfigSelectCircuit from './PumpConfigSelectCircuit'
import PumpConfigSelectRPMGPM from './PumpConfigSelectRPMGPM'
import PumpConfigSelectSpeedSlider from './PumpConfigSelectSpeedSlider'

interface Props
{
    pumpConfig: Pump.ExtendedConfig
    currentPump: Pump.PumpIndex
    circuit: Circuit.ICurrentCircuitsArr
}
interface State
{

}

class PumpConfigVS extends React.Component<Props, State> {

    constructor( props: Props )
    {
        super( props )

    }



    render ()
    {


        const CircuitSelectors =
            () =>
            {
                if ( this.props.pumpConfig.type === "NONE" )
                {
                    return ( <div>Set Pump Type</div> )
                }
                else
                    return Object.entries( this.props.pumpConfig.circuitSlot ).map( ( cs, idx ) =>
                    {
                        let speedDisplayOrSelect: React.ReactFragment = `${cs[ 1 ].flag === 'rpm' ? cs[ 1 ].rpm : cs[ 1 ].gpm} ${cs[ 1 ].flag.toUpperCase()}`

                        if ( this.props.pumpConfig.type === 'VSF' )
                        {
                            speedDisplayOrSelect = ( <PumpConfigSelectRPMGPM
                                currentPump={this.props.currentPump}
                                currentCircuitSlotNum={parseInt( cs[ 0 ] )}
                                currentSpeed={cs[ 1 ].flag === 'rpm' ? cs[ 1 ].rpm : cs[ 1 ].gpm}
                                currentFlag={cs[ 1 ].flag}
                            /> )
                        }



                        return (

                            <Row key={`${ this.props.currentPump }${ cs[ 1 ].friendlyName }${ idx }`}>


                                <Col className='col-4'>
                                    Circuit{' '}
                                    <PumpConfigSelectCircuit
                                        currentPump={this.props.currentPump}
                                        currentCircuitFriendlyName={cs[ 1 ].friendlyName}
                                        currentCircuitSlotNumber={parseInt( cs[ 0 ] )}
                                        circuit={this.props.circuit}
                                    />

                                </Col>

                                <Col className='col'>
                                    <PumpConfigSelectSpeedSlider
                                        currentPump={this.props.currentPump}
                                        currentCircuitSlotNum={parseInt( cs[ 0 ] )}
                                        currentSpeed={cs[ 1 ].flag === 'rpm' ? cs[ 1 ].rpm : cs[ 1 ].gpm}
                                        currentFlag={cs[ 1 ].flag}
                                    />
                                    
                                </Col>
                                <Col className='col-3'>
                                    {speedDisplayOrSelect}

                                </Col>
                            </Row> )
                    }
                    )
            }

        return (


            <Container>
                <Row >

                    <Col>
                        Type{' '}

                        <PumpConfigSelectType currentPumpType={this.props.pumpConfig.type} currentPump={this.props.currentPump} />
                    </Col>

                </Row>
                {CircuitSelectors()}
            </Container >



        )
    }
}

export default PumpConfigVS;