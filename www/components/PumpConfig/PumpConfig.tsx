import
{
    Row, Col, Button, ButtonGroup, Nav, NavItem, Dropdown, DropdownItem, DropdownToggle, DropdownMenu, NavLink
} from 'reactstrap';
import CustomCard from '../CustomCard'
import * as React from 'react';
import PumpConfigVS from './PumpConfigVS_VF_VSF'

interface Props
{
    circuit: Circuit.ICurrentCircuitsArr
    pumpConfig: Pump.ExtendedConfigObj
    pump: Pump.PumpStatus
    id: string;
    visibility: string;
}
interface State
{
    activeLink: string
    currentPump: Pump.PumpIndex | 0
}

class PumpConfig extends React.Component<Props, State> {

    constructor( props: Props )
    {
        super( props )

        if ( this.props.pumpConfig[ 1 ].type === 'NONE' )
        {
            this.state = {
                activeLink: 'pump1',
                currentPump: 0


            }
        }
        else
        {
            this.state = {
                activeLink: 'pump1',
                currentPump: 1
            }
        }
        this.handleNavClick = this.handleNavClick.bind( this )
    }

    componentDidUpdate ( prevProps: Props )
    {
        if ( prevProps.pumpConfig[ 1 ].type === 'NONE' && this.props.pumpConfig[ 1 ].type !== 'NONE' )
        {
            this.setState( {
                activeLink: 'pump1',
                currentPump: 1
            } )
        }
    }

    handleNavClick ( event: any )
    {
        let _activeLink = event.target.target;
        let _currentPump = parseInt( event.target.target.slice( -1 ) ) as Pump.PumpIndex
        this.setState( {
            activeLink: _activeLink,
            currentPump: _currentPump
        } )
    }


    render ()
    {
        let _navTabs: any[] = [];
        Object.entries( this.props.pumpConfig ).forEach( ( pump, idx ) =>
        {
            let _linkID = `pump${ pump[ 0 ] }`
            let _pumpNum = parseInt( pump[ 0 ] )
            // if ( pump[ 1 ].type !== 'NONE' )
            // {
                _navTabs.push( (
                    <NavItem key={`navPumpConfigKey${ _pumpNum }`}>
                        <NavLink href="#" target={_linkID} onClick={this.handleNavClick} active={this.state.activeLink ===
                            _linkID ? true : false}
                            className={this.state.activeLink ===
                                _linkID ? 'btn-primary' : 'btn-secondary'}
                        >
                            {this.props.pump[ idx + 1 ].friendlyName}
                        </NavLink>
                    </NavItem>
                ) )
            // }

        } )

        let currentPump = () =>
        {
            if ( this.props.pumpConfig[ 1 ].type !== 'NONE' )
            {

                return ( <PumpConfigVS pumpConfig={this.props.pumpConfig[ this.state.currentPump ]} currentPump={this.state.currentPump as Pump.PumpIndex}
                    circuit={this.props.circuit}
                /> )


            }
            else
            {
                return ( 'No pumps to see here.' )
            }

        }

        return (

            <div className="tab-pane active" id="pumpConfig" role="tabpanel" aria-labelledby="pumpConfig-tab">
                <CustomCard name='Pump Config' visibility={this.props.visibility} id={this.props.id}>
                    <div>
                        <Nav tabs>
                            {_navTabs}
                        </Nav>
                    </div>
                    {currentPump()}
                </CustomCard>
            </div>



        )
    }

}

export default PumpConfig;