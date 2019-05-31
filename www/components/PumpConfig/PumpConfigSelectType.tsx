import
{
    Row, Col, Button, ButtonGroup, Nav, NavItem, Dropdown, DropdownItem, DropdownToggle, DropdownMenu, NavLink, ButtonDropdown
} from 'reactstrap';
import {setPumpConfigType} from '../../components/Socket_Client'
import * as React from 'react';

interface Props
{
    currentPump: Pump.PumpIndex
    currentPumpType: Pump.PumpType
}
interface State
{
    dropdownOpen: boolean
}

class PumpConfigSelectType extends React.Component<Props, State> {

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
        console.log( `changing pump ${ this.props.currentPump } type to ${ event.target.value }` )
        setPumpConfigType(this.props.currentPump, event.target.value)
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
                    {this.props.currentPumpType}
                </DropdownToggle>
                <DropdownMenu>
                    <DropdownItem value='NONE' onClick={this.handleClick}>None</DropdownItem>
                    <DropdownItem value='VS' onClick={this.handleClick}>VS</DropdownItem>
                    <DropdownItem value='VSF' onClick={this.handleClick}>VSF</DropdownItem>
                    <DropdownItem value='VF' onClick={this.handleClick}>VF</DropdownItem>
                </DropdownMenu>
            </ButtonDropdown>
        )
    }
}

export default PumpConfigSelectType;