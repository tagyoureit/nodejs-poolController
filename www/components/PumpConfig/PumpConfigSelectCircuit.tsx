import
{
    Row, Col, Container, Button, ButtonGroup, Nav, NavItem, Dropdown, DropdownItem, DropdownToggle, DropdownMenu, NavLink, ButtonDropdown
} from 'reactstrap';
import CustomCard from '../CustomCard'
import * as React from 'react';
import '../../css/dropdownselect'
import {setPumpConfigCircuit} from '../../components/Socket_Client'

interface Props
{
    currentPump: Pump.PumpIndex
    currentCircuitFriendlyName: string
    currentCircuitSlotNumber: number
    circuit: Circuit.ICurrentCircuitsArr
}
interface State
{
    dropdownOpen: boolean
}

class PumpConfigSelectCircuit extends React.Component<Props, State> {

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
        console.log( `changing pump ${ this.props.currentPump } circuitSlot ${ this.props.currentCircuitSlotNumber } type to circuit ${ event.target.value } (${ this.props.circuit[ event.target.value ].friendlyName })` )
        setPumpConfigCircuit(this.props.currentPump, this.props.currentCircuitSlotNumber, parseInt(event.target.value))
    }

    toggle ()
    {
        this.setState( {
            dropdownOpen: !this.state.dropdownOpen
        } );
    }

    render ()
    {

        const circuitSelectors = () =>
        {
            let dropdownChildren: React.ReactFragment[] = []
            Object.entries( this.props.circuit ).forEach( ( _circuit ) =>
            {
                dropdownChildren.push( ( <DropdownItem key={`${ this.props.currentPump }${ _circuit[ 1 ].number }CircuitSelect`}
                    value={_circuit[ 1 ].number}
                    onClick={this.handleClick}

                >
                    {_circuit[ 1 ].friendlyName}
                </DropdownItem> ) )
            } )
            return dropdownChildren
        }

        return (


            <ButtonDropdown size='sm' isOpen={this.state.dropdownOpen} toggle={this.toggle}
                style={{ width: '60%' }} className='fullWidth'
            >
                <DropdownToggle caret >
                    {this.props.currentCircuitFriendlyName}
                </DropdownToggle>
                <DropdownMenu >

                    {circuitSelectors()}
                    <DropdownItem>Add Solar</DropdownItem>
                    <DropdownItem>Add Pool Heater</DropdownItem>
                    <DropdownItem>Add Spa Heater</DropdownItem>
                    <DropdownItem>Add Either Heater</DropdownItem>
                    <DropdownItem>Add Freeze</DropdownItem>

                </DropdownMenu>
            </ButtonDropdown>


        )
    }
}

export default PumpConfigSelectCircuit;