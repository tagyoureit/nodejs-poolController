import
{
    Row, Col, Button, ButtonGroup, Nav, NavItem, Dropdown, DropdownItem, DropdownToggle, DropdownMenu, NavLink
} from 'reactstrap';
import CustomCard from '../CustomCard'
import * as React from 'react';
import PumpConfigTabs from './PumpConfigTabs'
import { IStatePoolPump, IConfigPump, getItemById } from '../PoolController';

interface Props
{
    condensedCircuitsAndFeatures: { id: number, name: string, type: string }[];
    pumpConfig: IConfigPump[];
    pumpState: IStatePoolPump[];
    id: string;
    visibility: string;
}
interface State
{
    activeLink: string
    currentPump: number
}

class PumpConfigModalPopup extends React.Component<Props, State> {

    constructor( props: Props )
    {
        super( props )
        this.state = {
            activeLink: 'pump1',
            currentPump: 1
        }
        this.handleNavClick = this.handleNavClick.bind( this )
    }

    componentDidUpdate ( prevProps: Props )
    {
        // if ( prevProps.pumps[ 1 ].type === 'NONE' && this.props.pumpConfig[ 1 ].type !== 'NONE' )
        // {
        //     this.setState( {
        //         activeLink: 'pump1',
        //         currentPump: 1
        //     } )
        // }
    }

    handleNavClick ( event: any )
    {
        let _activeLink = event.target.target;
        let _currentPump = parseInt( event.target.target.slice( -1 ) )
        this.setState( {
            activeLink: _activeLink,
            currentPump: _currentPump
        } )
    }
    render ()
    {
        let _navTabs: any[] = [];
        this.props.pumpConfig.forEach( ( pump, idx ) =>
        {
            let _linkID = `pump${ pump.id }`
            _navTabs.push( (
                <NavItem key={`navPumpConfigKey${ pump.id }`}>
                    <NavLink href="#" target={_linkID} onClick={this.handleNavClick} active={this.state.activeLink ===
                        _linkID ? true : false}
                        className={this.state.activeLink ===
                            _linkID ? 'btn-primary' : 'btn-secondary'}
                    >
                        {pump.id}: {getItemById(this.props.pumpState, pump.id).type.desc}
                    </NavLink>
                </NavItem>
            ) )
            // }

        } )

        let currentPump = () =>
        {
            return ( <PumpConfigTabs
                pumpConfig={getItemById( this.props.pumpConfig, this.state.currentPump )}
                currentPump={this.state.currentPump}
                condensedCircuitsAndFeatures={this.props.condensedCircuitsAndFeatures}
                pumpState={getItemById(this.props.pumpState, this.state.currentPump)}
            /> )
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

export default PumpConfigModalPopup;