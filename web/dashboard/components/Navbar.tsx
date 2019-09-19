import StatusIndicator from './StatusIndicator'
import * as React from 'react';
import { IDetail } from './PoolController';

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
    status: IDetail & { percent?: number };
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
            <Navbar color="light" light sticky="top" >
                <NavbarBrand href="/" >nodejs-PoolController
                </NavbarBrand>

                <NavbarToggler onClick={this.toggle} />
                <Collapse isOpen={this.state.isOpen} navbar>
                    <Nav className="ml-auto" >
                        <NavItem>
                            <NavLink onClick={this.toggle} href="#system" id='system-tab' data-toggle='tab' aria-controls='system' aria-selected='false'>System Info</NavLink>
                        </NavItem>
                        <NavItem>
                            <NavLink onClick={this.toggle} href="#bodies"
                                id='bodies-tab' data-toggle='tab' aria-controls='bodies' aria-selected='false'
                            >Bodies</NavLink>
                        </NavItem>
                        <NavItem>
                            <NavLink onClick={this.toggle} href="#pump"
                                id='pump-tab' data-toggle='tab' aria-controls='pumps' aria-selected='false'
                            >Pumps</NavLink>
                        </NavItem>
                        <NavItem>
                            <NavLink onClick={this.toggle} href="#circuits"
                                id='circuits-tab' data-toggle='tab' aria-controls='circuits' aria-selected='false'
                            >Circuits</NavLink>
                        </NavItem>
                        <NavItem>
                            <NavLink onClick={this.toggle} href="#features"
                                id='features-tab' data-toggle='tab' aria-controls='features' aria-selected='false'
                            >Features</NavLink>
                        </NavItem>
                        <NavItem>
                            <NavLink onClick={this.toggle} href="#schedules"
                                id='schedules-tab' data-toggle='tab' aria-controls='schedules' aria-selected='false'
                            >Schedules</NavLink>
                        </NavItem>
                        <NavItem>
                            <NavLink onClick={this.toggle} href="#eggtimers"
                                id='eggtimers-tab' data-toggle='tab' aria-controls='eggtimers' aria-selected='false'
                            >EggTimers</NavLink>
                        </NavItem>
                        <NavItem>
                            <NavLink onClick={this.toggle} href="#chlorinators" id='chlorinators-tab' data-toggle='tab' aria-controls='chlorinators' aria-selected='false'>Chlorinators</NavLink>
                        </NavItem>
                        <NavItem>
                            <NavLink onClick={this.toggle} href="#light" id='light-tab' data-toggle='tab' aria-controls='light' aria-selected='false'>Lights</NavLink>
                        </NavItem>
                        <NavItem>
                            <NavLink onClick={this.toggle} href="#debug" id='debug-tab' data-toggle='tab' aria-controls='debug' aria-selected='false'>Debug Log</NavLink>
                        </NavItem>
                        <NavItem>
                            <NavLink onClick={this.toggle} href="/utilities" id='utilities' >Utilities</NavLink>
                        </NavItem>
                    </Nav>
                </Collapse>

            </Navbar>
        )
    }
}
export default PoolNav;