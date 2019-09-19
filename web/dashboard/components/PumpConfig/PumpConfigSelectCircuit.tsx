import
{
    Row, Col, Container, Button, ButtonGroup, Nav, NavItem, Dropdown, DropdownItem, DropdownToggle, DropdownMenu, NavLink, ButtonDropdown
} from 'reactstrap';
import CustomCard from '../CustomCard'
import * as React from 'react';
import '../../css/dropdownselect'
import { setPumpConfigCircuit } from '../../components/Socket_Client'
import { getItemById } from '../PoolController';

interface Props
{
    currentPump: number
    circuitName: string
    currentCircuitSlotNumber: number
    condensedCircuitsAndFeatures: { id: number, name: string, type: string }[];
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
        console.log( `changing pump=${ this.props.currentPump } circuitSlot=${ this.props.currentCircuitSlotNumber } type to circuit ${ event.target.value } (${ getItemById(this.props.condensedCircuitsAndFeatures, parseInt(event.target.value, 10)) .name })` )
        
        setPumpConfigCircuit( this.props.currentPump, parseInt( event.target.value, 10 ), this.props.currentCircuitSlotNumber )
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
            let dropdownChildren: React.ReactFragment[] = [];
            for ( let i = 0; i < this.props.condensedCircuitsAndFeatures.length; i++ )
            {
                let circ = this.props.condensedCircuitsAndFeatures[ i ];
                let entry:React.ReactFragment = ( <DropdownItem key={`${ this.props.currentPump }${ circ.id }CircuitSelect`}
                    value={circ.id}
                    onClick={this.handleClick}
                >
                    {circ.name}
                </DropdownItem> )
                dropdownChildren.push( entry );
            }
            return dropdownChildren;
        }

        return (
            <ButtonDropdown size='sm' isOpen={this.state.dropdownOpen} toggle={this.toggle}
                style={{ width: '60%' }} className='fullWidth'
            >
                <DropdownToggle caret >
                    {this.props.circuitName}
                </DropdownToggle>
                <DropdownMenu >
                   {circuitSelectors()}
                </DropdownMenu>
            </ButtonDropdown>


        )
    }
}

export default PumpConfigSelectCircuit;