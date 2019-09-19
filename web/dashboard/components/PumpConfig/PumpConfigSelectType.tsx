import
{
    Row, Col, Button, ButtonGroup, Nav, NavItem, Dropdown, DropdownItem, DropdownToggle, DropdownMenu, NavLink, ButtonDropdown
} from 'reactstrap';
import {setPumpConfigType} from '../../components/Socket_Client'
import * as React from 'react';
import { IDetail } from '../PoolController';
var extend = require( 'extend' );

interface Props
{
    currentPump: number
    currentPumpType: number
}
interface State
{
    dropdownOpen: boolean,
    pumpType: string
}

class PumpConfigSelectType extends React.Component<Props, State> {
    pumpType;
    constructor( props: Props )
    {
        super( props )
        this.toggle = this.toggle.bind( this );
        this.handleClick = this.handleClick.bind( this );
        this.pumpType = {
            0: { val: 0, name: 'none', desc: 'No pump' },
            // 1: { val: 1, name: 'ss', desc: 'Single Speed' },
            // 2: { val: 2, name: 'ds', desc: 'Two Speed' },
            3: { val: 3, name: 'vs', desc: 'Intelliflo VS' },
            4: { val: 4, name: 'vsf', desc: 'Intelliflo VSF' },
            5: { val: 5, name: 'vf', desc: 'Intelliflo VF' },
            transform: function ( byte ) { return extend( true, {}, this[ byte ] || this[ 0 ] ); }
        }
        this.state = {
            dropdownOpen: false,
            pumpType: this.pumpType.transform(this.props.currentPumpType).desc
        };
    }
    componentDidUpdate ( prevProps )
    {
        if ( this.props.currentPumpType !== prevProps.currentPumpType )
        {
            this.setState( {
                pumpType: this.pumpType.transform( this.props.currentPumpType ).desc
            } );
        }
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
    pumpTypes ()
    {
        let ret:React.ReactFragment[] = [];
        for ( let i = 0; i <= 5; i++ )
        {
            if ( !this.pumpType[ i ] ) continue;
            let p = this.pumpType.transform( i );
            ret.push( ( <DropdownItem key={'pumpType' +this.props.currentPump+p.val} value={p.val} onClick={this.handleClick}>{p.desc}</DropdownItem>))
        }
        return ret;
    }
    render ()
    {
        return (
            <ButtonDropdown size='sm' className='mb-1 mt-1' isOpen={this.state.dropdownOpen} toggle={this.toggle}>
                <DropdownToggle caret>
                    {this.state.pumpType}
                </DropdownToggle>
                <DropdownMenu>
                    {this.pumpTypes()}
                </DropdownMenu>
            </ButtonDropdown>
        )
    }
}

export default PumpConfigSelectType;