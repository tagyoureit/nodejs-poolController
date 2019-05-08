import RefreshCounter from '../components/RefreshCounter'
import * as React from 'react';

import
{
    Collapse,
    Navbar,
    NavbarToggler,
    NavbarBrand,
    Nav,
    NavItem,
    NavLink
} from 'reactstrap';

interface Props
{
    counter: number;
}

class PoolNav extends React.Component<Props, any> {

    constructor( props: Props )
    {
        super( props );

        this.toggle = this.toggle.bind( this );
        this.state = {
            isOpen: false
        };

    }
    toggle ()
    {
        this.setState( {
            isOpen: !this.state.isOpen
        } );
    }

    render ()
    {
        return (
            <Navbar color="light" light sticky="top">
                <NavbarBrand href="/">nodejs-PoolController</NavbarBrand>
                <RefreshCounter counter={this.props.counter}></RefreshCounter>
                <Nav className="ml-auto" navbar>
                    <NavbarToggler onClick={this.toggle} />
                    <Collapse isOpen={this.state.isOpen} navbar>
                        <Nav className="ml-auto" >
                            <NavItem>
                                <NavLink onClick={this.toggle} href="#system" id='system-tab' data-toggle='tab' aria-controls='system' aria-selected='false'>System Info</NavLink>
                            </NavItem>
                            <NavItem>
                                <NavLink onClick={this.toggle} href="#pool"
                                    id='pool-tab' data-toggle='tab' aria-controls='pool' aria-selected='false'
                                >Pool</NavLink>
                            </NavItem>
                            <NavItem>
                                <NavLink onClick={this.toggle} href="#spa"
                                    id='spa-tab' data-toggle='tab' aria-controls='spa' aria-selected='false'
                                >Spa</NavLink>
                            </NavItem>
                            <NavItem>
                                <NavLink onClick={this.toggle} href="#pump"
                                    id='pump-tab' data-toggle='tab' aria-controls='pump' aria-selected='false'
                                >Pumps</NavLink>
                            </NavItem>
                            <NavItem>
                                <NavLink onClick={this.toggle} href="#feature"
                                    id='feature-tab' data-toggle='tab' aria-controls='feature' aria-selected='false'
                                >Features</NavLink>
                            </NavItem>
                            <NavItem>
                                <NavLink onClick={this.toggle} href="#schedule"
                                    id='schedule-tab' data-toggle='tab' aria-controls='schedule' aria-selected='false'
                                >Schedule</NavLink>
                            </NavItem>
                            <NavItem>
                                <NavLink onClick={this.toggle} href="#eggtimer"
                                    id='eggtimer-tab' data-toggle='tab' aria-controls='eggtimer' aria-selected='false'
                                >EggTimer</NavLink>
                            </NavItem>
                            <NavItem>
                                <NavLink onClick={this.toggle} href="#chlorinator" id='chlorinator-tab' data-toggle='tab' aria-controls='chlorinator' aria-selected='false'>Chlorinator</NavLink>
                            </NavItem>
                            <NavItem>
                                <NavLink onClick={this.toggle} href="#light" id='light-tab' data-toggle='tab' aria-controls='light' aria-selected='false'>Lights</NavLink>
                            </NavItem>
                            <NavItem>
                                <NavLink onClick={this.toggle} href="#debug" id='debug-tab' data-toggle='tab' aria-controls='debug' aria-selected='false'>Debug Log</NavLink>
                            </NavItem>
                        </Nav>
                    </Collapse>
                </Nav>
            </Navbar>
        )
    }
}
export default PoolNav;