import
{
    Row, Col, Button, ButtonGroup, Nav, NavItem, Dropdown, DropdownItem, DropdownToggle, DropdownMenu, NavLink, ButtonDropdown
} from 'reactstrap';
import {setPumpConfigRPMGPM} from '../../components/Socket_Client'
import * as React from 'react';

interface Props
{
    currentSpeed: number
    currentPump: Pump.PumpIndex
    currentFlag: Pump.PumpSpeedType
    currentCircuitSlotNum: number
}
interface State
{
    dropdownOpen: boolean
}

class PumpConfigSelectRPMGPM extends React.Component<Props, State> {

    constructor( props: Props )
    {
        super( props )
        this.toggle = this.toggle.bind( this );
        this.handleClick = this.handleClick.bind( this );
        this.state = {
            dropdownOpen: false
        };
    }

    handleClick ( event: any )
    {
        console.log( `changing pump ${ this.props.currentPump } circuitSlot ${this.props.currentCircuitSlotNum} type to ${ event.target.value }` )
        setPumpConfigRPMGPM(this.props.currentPump, this.props.currentCircuitSlotNum, event.target.value)
    }

    toggle ()
    {
        this.setState( {
            dropdownOpen: !this.state.dropdownOpen
        } );
    }
    render ()
    {
        return (
            <ButtonDropdown size='sm' className='mb-1 mt-1' isOpen={this.state.dropdownOpen} toggle={this.toggle}>
                <DropdownToggle caret>
                    {`${ this.props.currentSpeed } ${ this.props.currentFlag }`}
                </DropdownToggle>
                <DropdownMenu>
                    <DropdownItem value='rpm' onClick={this.handleClick}>rpm</DropdownItem>
                    <DropdownItem value='gpm' onClick={this.handleClick}>gpm</DropdownItem>
                </DropdownMenu>
            </ButtonDropdown>
        )
    }
}

export default PumpConfigSelectRPMGPM;